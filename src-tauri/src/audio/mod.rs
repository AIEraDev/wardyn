/// Native audio capture pipeline — Rust-side only, bypasses WKWebView entirely.
///
/// Flow:
///   cpal mic stream → ring buffer → VAD (energy threshold) → 16kHz mono f32 chunks
///   → Ollama /v1/audio/transcriptions → Tauri event "transcription-delta" → UI
///
/// This avoids every WKWebView/entitlements/QuickTime issue because the WebView
/// never touches the audio hardware.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
// ─── Shared recording state ───────────────────────────────────────────────────

pub struct AudioRecordingState {
    pub running: Arc<AtomicBool>,
    /// Accumulates transcribed text across all chunks so the UI shows a growing transcript
    pub transcript: Arc<Mutex<String>>,
}

impl Default for AudioRecordingState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            transcript: Arc::new(Mutex::new(String::new())),
        }
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/// Whisper requires 16 kHz mono f32 audio
const WHISPER_SAMPLE_RATE: u32 = 16_000;
/// Collect 4 seconds of audio per chunk before sending to Whisper
const CHUNK_SECONDS: usize = 4;
/// Energy threshold below which a chunk is treated as silence and skipped
const SILENCE_THRESHOLD: f32 = 0.008;

// ─── Entry point ─────────────────────────────────────────────────────────────

pub async fn start_native_capture(
    app: AppHandle,
    running: Arc<AtomicBool>,
    transcript: Arc<Mutex<String>>,
) -> Result<(), String> {
    running.store(true, Ordering::SeqCst);

    let (sample_tx, mut sample_rx) = mpsc::channel::<Vec<f32>>(64);

    // ── Spawn the cpal capture on a dedicated OS thread ──────────────────────
    let running_clone = Arc::clone(&running);
    std::thread::spawn(move || {
        if let Err(e) = run_cpal_capture(sample_tx, running_clone) {
            eprintln!("[audio] cpal capture error: {}", e);
        }
    });

    // ── Process chunks: resample → VAD → Whisper → emit ──────────────────────
    let chunk_size_native = Arc::new(Mutex::new(0usize)); // set after first samples arrive
    let mut accumulator: Vec<f32> = Vec::new();
    let mut native_sr: Option<u32> = None;

    while running.load(Ordering::SeqCst) {
        match tokio::time::timeout(
            tokio::time::Duration::from_millis(200),
            sample_rx.recv(),
        )
        .await
        {
            Ok(Some(mut chunk)) => {
                // First chunk carries sample-rate info encoded as a sentinel
                if native_sr.is_none() {
                    if let Some(first) = chunk.first().copied() {
                        // We encode the sample rate as the first f32 value (as u32 bits)
                        let sr = f32::to_bits(first);
                        if sr > 8000 && sr < 200_000 {
                            native_sr = Some(sr);
                            *chunk_size_native.lock().unwrap() =
                                (sr as usize) * CHUNK_SECONDS;
                            chunk.remove(0);
                        }
                    }
                }

                accumulator.extend_from_slice(&chunk);

                let target_native = *chunk_size_native.lock().unwrap();
                if target_native == 0 || accumulator.len() < target_native {
                    continue;
                }

                // Take exactly one chunk's worth
                let raw_chunk: Vec<f32> = accumulator.drain(..target_native).collect();

                // VAD: skip silent chunks
                let energy = raw_chunk.iter().map(|s| s * s).sum::<f32>() / raw_chunk.len() as f32;
                if energy < SILENCE_THRESHOLD * SILENCE_THRESHOLD {
                    continue;
                }

                // Resample to 16kHz if needed
                let resampled = if native_sr == Some(WHISPER_SAMPLE_RATE) {
                    raw_chunk
                } else {
                    let sr = native_sr.unwrap_or(44100) as f64;
                    match resample_to_16k(&raw_chunk, sr) {
                        Ok(r) => r,
                        Err(e) => {
                            eprintln!("[audio] resample error: {}", e);
                            continue;
                        }
                    }
                };

                // Encode as WAV bytes for Whisper
                let wav_bytes = match encode_wav_bytes(&resampled, WHISPER_SAMPLE_RATE) {
                    Ok(b) => b,
                    Err(e) => {
                        eprintln!("[audio] WAV encode error: {}", e);
                        continue;
                    }
                };

                // Transcribe via Ollama Whisper
                let app_clone = app.clone();
                let transcript_clone = Arc::clone(&transcript);
                tokio::spawn(async move {
                    match transcribe_chunk(wav_bytes).await {
                        Ok(text) if !text.trim().is_empty() => {
                            // Append to running transcript
                            let mut t = transcript_clone.lock().unwrap();
                            if !t.is_empty() { t.push(' '); }
                            t.push_str(text.trim());
                            let full = t.clone();
                            drop(t);
                            // Emit to UI — sends the full accumulated transcript
                            let _ = app_clone.emit("transcription-delta", full);
                        }
                        Err(e) => {
                            eprintln!("[audio] transcription error: {}", e);
                        }
                        _ => {}
                    }
                });
            }
            Ok(None) => break, // channel closed
            Err(_) => {} // timeout — just loop and check running flag
        }
    }

    running.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn stop_native_capture(running: &Arc<AtomicBool>, transcript: &Arc<Mutex<String>>) -> String {
    running.store(false, Ordering::SeqCst);
    let t = transcript.lock().unwrap().clone();
    // Clear for next session
    *transcript.lock().unwrap() = String::new();
    t
}

// ─── cpal capture ────────────────────────────────────────────────────────────

fn run_cpal_capture(
    tx: mpsc::Sender<Vec<f32>>,
    running: Arc<AtomicBool>,
) -> Result<(), String> {
    let host = cpal::default_host();

    let device = host
        .default_input_device()
        .ok_or("No input device available")?;

    let config = device
        .default_input_config()
        .map_err(|e| format!("Default input config error: {}", e))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    // Send sample rate as first sentinel value
    let tx_clone = tx.clone();
    let _ = tx_clone.blocking_send(vec![f32::from_bits(sample_rate)]);

    let tx_data = tx.clone();
    let running_stream = Arc::clone(&running);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_stream::<f32>(
            &device, &config.into(), channels, tx_data, running_stream,
        ),
        cpal::SampleFormat::I16 => build_stream_i16(
            &device, &config.into(), channels, tx_data, running_stream,
        ),
        cpal::SampleFormat::U16 => build_stream_u16(
            &device, &config.into(), channels, tx_data, running_stream,
        ),
        _ => Err("Unsupported sample format".to_string()),
    }?;

    stream.play().map_err(|e| format!("Stream play error: {}", e))?;

    // Keep the stream alive while recording
    while running.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    Ok(())
}

fn build_stream<T: cpal::Sample + cpal::SizedSample + Into<f32> + Send + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    tx: mpsc::Sender<Vec<f32>>,
    running: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if !running.load(Ordering::SeqCst) { return; }
                // Downmix to mono
                let mono: Vec<f32> = data
                    .chunks(channels)
                    .map(|frame| frame.iter().map(|&s| s.into()).sum::<f32>() / channels as f32)
                    .collect();
                let _ = tx.try_send(mono);
            },
            |e| eprintln!("[audio] stream error: {}", e),
            None,
        )
        .map_err(|e| format!("Build stream error: {}", e))
}

fn build_stream_i16(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    tx: mpsc::Sender<Vec<f32>>,
    running: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                if !running.load(Ordering::SeqCst) { return; }
                let mono: Vec<f32> = data
                    .chunks(channels)
                    .map(|frame| frame.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32)
                    .collect();
                let _ = tx.try_send(mono);
            },
            |e| eprintln!("[audio] stream error: {}", e),
            None,
        )
        .map_err(|e| format!("Build stream error: {}", e))
}

fn build_stream_u16(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    tx: mpsc::Sender<Vec<f32>>,
    running: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                if !running.load(Ordering::SeqCst) { return; }
                let mono: Vec<f32> = data
                    .chunks(channels)
                    .map(|frame| frame.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).sum::<f32>() / channels as f32)
                    .collect();
                let _ = tx.try_send(mono);
            },
            |e| eprintln!("[audio] stream error: {}", e),
            None,
        )
        .map_err(|e| format!("Build stream error: {}", e))
}

// ─── Resampling ───────────────────────────────────────────────────────────────

fn resample_to_16k(samples: &[f32], from_sr: f64) -> Result<Vec<f32>, String> {
    let params = SincInterpolationParameters {
        sinc_len: 64,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 64,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = WHISPER_SAMPLE_RATE as f64 / from_sr;
    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0,
        params,
        samples.len(),
        1, // mono
    )
    .map_err(|e| format!("Resampler init error: {:?}", e))?;

    let input = vec![samples.to_vec()];
    let output = resampler
        .process(&input, None)
        .map_err(|e| format!("Resample error: {:?}", e))?;

    Ok(output.into_iter().next().unwrap_or_default())
}

// ─── WAV encoding ─────────────────────────────────────────────────────────────

fn encode_wav_bytes(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, String> {
    // PCM 16-bit WAV — universally supported by Whisper
    let pcm: Vec<i16> = samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect();

    let data_len = (pcm.len() * 2) as u32;
    let file_len = 36 + data_len;

    let mut wav = Vec::with_capacity((44 + pcm.len() * 2) as usize);

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_len.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());       // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes());         // PCM
    wav.extend_from_slice(&1u16.to_le_bytes());         // mono
    wav.extend_from_slice(&sample_rate.to_le_bytes());  // sample rate
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    wav.extend_from_slice(&2u16.to_le_bytes());         // block align
    wav.extend_from_slice(&16u16.to_le_bytes());        // bits per sample
    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in pcm {
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    Ok(wav)
}

// ─── Whisper transcription ────────────────────────────────────────────────────

async fn transcribe_chunk(wav_bytes: Vec<u8>) -> Result<String, String> {
    use crate::speech::find_installed_whisper_model;

    let model_name = find_installed_whisper_model()
        .await
        .ok_or("No Whisper model installed")?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let file_part = reqwest::multipart::Part::bytes(wav_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", model_name)
        .text("response_format", "json");

    #[derive(serde::Deserialize)]
    struct Resp { text: String }

    let resp = client
        .post("http://localhost:11434/v1/audio/transcriptions")
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Whisper HTTP {}", resp.status()));
    }

    let r: Resp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r.text.trim().to_string())
}
