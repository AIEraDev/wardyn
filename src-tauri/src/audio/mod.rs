/// Native audio capture pipeline — Rust-side only, bypasses WKWebView entirely.
///
/// Flow:
///   cpal mic → mono f32 ring buffer → 4s chunks → VAD → resample to 16kHz
///   → PCM WAV → Ollama /v1/audio/transcriptions → Tauri "transcription-delta" event

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

// ─── Shared state ─────────────────────────────────────────────────────────────

pub struct AudioRecordingState {
    pub running: Arc<AtomicBool>,
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

const WHISPER_SAMPLE_RATE: u32 = 16_000;
const CHUNK_SECONDS: f32 = 4.0;
/// RMS energy threshold — chunks below this are silence and skipped
const SILENCE_RMS: f32 = 0.01;

// ─── Public API ───────────────────────────────────────────────────────────────

pub async fn start_native_capture(
    app: AppHandle,
    running: Arc<AtomicBool>,
    transcript: Arc<Mutex<String>>,
) -> Result<(), String> {
    running.store(true, Ordering::SeqCst);

    // Channel carries (samples: Vec<f32>, sample_rate: u32)
    let (tx, mut rx) = mpsc::channel::<(Vec<f32>, u32)>(32);

    // Spawn cpal on its own OS thread — cpal streams are not Send/Sync-friendly
    let running_cpal = Arc::clone(&running);
    std::thread::spawn(move || {
        if let Err(e) = run_cpal_capture(tx, running_cpal) {
            eprintln!("[audio] cpal error: {}", e);
        }
    });

    // Resolve whisper model once upfront
    let whisper_model = crate::speech::find_installed_whisper_model().await;
    if whisper_model.is_none() {
        let _ = app.emit("transcription-status", "error: No Whisper model installed. Go to Settings → Voice Capture.");
        running.store(false, Ordering::SeqCst);
        return Err("No Whisper model".to_string());
    }
    let whisper_model = whisper_model.unwrap();

    let mut accumulator: Vec<f32> = Vec::new();
    let mut native_sr: Option<u32> = None;

    while running.load(Ordering::SeqCst) {
        // Wait up to 200ms for new audio data
        let recv = tokio::time::timeout(
            tokio::time::Duration::from_millis(200),
            rx.recv(),
        ).await;

        match recv {
            Ok(Some((chunk, sr))) => {
                // Set sample rate on first chunk
                if native_sr.is_none() {
                    native_sr = Some(sr);
                    eprintln!("[audio] mic sample rate: {} Hz, {} ch", sr, 1);
                }
                accumulator.extend_from_slice(&chunk);

                // How many samples make up CHUNK_SECONDS at the native rate?
                let target = (native_sr.unwrap_or(44100) as f32 * CHUNK_SECONDS) as usize;
                if accumulator.len() < target {
                    continue;
                }

                let raw: Vec<f32> = accumulator.drain(..target).collect();

                // VAD — skip silence
                let rms = (raw.iter().map(|s| s * s).sum::<f32>() / raw.len() as f32).sqrt();
                if rms < SILENCE_RMS {
                    continue;
                }

                // Resample to 16kHz
                let sr = native_sr.unwrap_or(44100);
                let resampled = if sr == WHISPER_SAMPLE_RATE {
                    raw
                } else {
                    match resample(&raw, sr) {
                        Ok(r) => r,
                        Err(e) => { eprintln!("[audio] resample error: {}", e); continue; }
                    }
                };

                // Encode WAV
                let wav = encode_wav(&resampled, WHISPER_SAMPLE_RATE);

                // Transcribe in background — don't block the accumulator loop
                let app2 = app.clone();
                let transcript2 = Arc::clone(&transcript);
                let model = whisper_model.clone();
                tokio::spawn(async move {
                    match transcribe(wav, &model).await {
                        Ok(text) if !text.trim().is_empty() => {
                            let mut t = transcript2.lock().unwrap();
                            if !t.is_empty() { t.push(' '); }
                            t.push_str(text.trim());
                            let full = t.clone();
                            drop(t);
                            let _ = app2.emit("transcription-delta", full);
                        }
                        Err(e) => eprintln!("[audio] transcribe error: {}", e),
                        _ => {}
                    }
                });
            }
            Ok(None) => break,
            Err(_) => {} // timeout, loop
        }
    }

    running.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn stop_native_capture(
    running: &Arc<AtomicBool>,
    transcript: &Arc<Mutex<String>>,
) -> String {
    running.store(false, Ordering::SeqCst);
    let t = transcript.lock().unwrap().clone();
    *transcript.lock().unwrap() = String::new();
    t
}

// ─── cpal capture ────────────────────────────────────────────────────────────

/// Captures mono f32 audio from the default input device.
/// Sends (mono_samples, sample_rate) pairs over the channel.
fn run_cpal_capture(
    tx: mpsc::Sender<(Vec<f32>, u32)>,
    running: Arc<AtomicBool>,
) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or_else(|| "No input device available".to_string())?;

    let config = device.default_input_config()
        .map_err(|e| format!("Input config error: {}", e))?;

    let sr = config.sample_rate().0;
    let ch = config.channels() as usize;

    eprintln!("[audio] opening device: {}, sr={}, ch={}, fmt={:?}",
        device.name().unwrap_or_default(), sr, ch, config.sample_format());

    let err_fn = |e| eprintln!("[audio] stream error: {}", e);

    let stream: cpal::Stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let tx = tx.clone();
            let r = Arc::clone(&running);
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !r.load(Ordering::Relaxed) { return; }
                    let mono = downmix_f32(data, ch);
                    let _ = tx.try_send((mono, sr));
                },
                err_fn, None,
            ).map_err(|e| e.to_string())?
        }
        cpal::SampleFormat::I16 => {
            let tx = tx.clone();
            let r = Arc::clone(&running);
            device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !r.load(Ordering::Relaxed) { return; }
                    let mono = downmix_i16(data, ch);
                    let _ = tx.try_send((mono, sr));
                },
                err_fn, None,
            ).map_err(|e| e.to_string())?
        }
        cpal::SampleFormat::U16 => {
            let tx = tx.clone();
            let r = Arc::clone(&running);
            device.build_input_stream(
                &config.into(),
                move |data: &[u16], _| {
                    if !r.load(Ordering::Relaxed) { return; }
                    let mono = downmix_u16(data, ch);
                    let _ = tx.try_send((mono, sr));
                },
                err_fn, None,
            ).map_err(|e| e.to_string())?
        }
        fmt => return Err(format!("Unsupported sample format: {:?}", fmt)),
    };

    stream.play().map_err(|e| format!("Stream play error: {}", e))?;

    while running.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    drop(stream);
    Ok(())
}

fn downmix_f32(data: &[f32], ch: usize) -> Vec<f32> {
    if ch == 1 { return data.to_vec(); }
    data.chunks(ch)
        .map(|f| f.iter().sum::<f32>() / ch as f32)
        .collect()
}

fn downmix_i16(data: &[i16], ch: usize) -> Vec<f32> {
    data.chunks(ch)
        .map(|f| f.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / ch as f32)
        .collect()
}

fn downmix_u16(data: &[u16], ch: usize) -> Vec<f32> {
    data.chunks(ch)
        .map(|f| f.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).sum::<f32>() / ch as f32)
        .collect()
}

// ─── Resampling ───────────────────────────────────────────────────────────────

fn resample(samples: &[f32], from_sr: u32) -> Result<Vec<f32>, String> {
    let ratio = WHISPER_SAMPLE_RATE as f64 / from_sr as f64;

    // rubato SincFixedIn expects the number of input frames per call
    // Use a fixed chunk size of 1024 frames and process in batches
    const FRAMES: usize = 1024;

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(ratio, 2.0, params, FRAMES, 1)
        .map_err(|e| format!("Resampler init: {:?}", e))?;

    let mut output: Vec<f32> = Vec::with_capacity((samples.len() as f64 * ratio) as usize + 1024);
    let mut pos = 0;

    while pos + FRAMES <= samples.len() {
        let frame = &samples[pos..pos + FRAMES];
        let inp = vec![frame.to_vec()];
        match resampler.process(&inp, None) {
            Ok(out) => output.extend_from_slice(&out[0]),
            Err(e) => return Err(format!("Resample process: {:?}", e)),
        }
        pos += FRAMES;
    }

    // Handle remaining samples
    if pos < samples.len() {
        let mut padded = samples[pos..].to_vec();
        padded.resize(FRAMES, 0.0);
        let inp = vec![padded];
        if let Ok(out) = resampler.process(&inp, None) {
            let expected = ((samples.len() - pos) as f64 * ratio) as usize;
            output.extend_from_slice(&out[0][..expected.min(out[0].len())]);
        }
    }

    Ok(output)
}

// ─── WAV encoding ─────────────────────────────────────────────────────────────

fn encode_wav(samples: &[f32], sr: u32) -> Vec<u8> {
    let pcm: Vec<i16> = samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect();

    let data_len = (pcm.len() * 2) as u32;
    let mut w = Vec::with_capacity(44 + data_len as usize);

    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + data_len).to_le_bytes());
    w.extend_from_slice(b"WAVE");
    w.extend_from_slice(b"fmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes());       // PCM
    w.extend_from_slice(&1u16.to_le_bytes());       // mono
    w.extend_from_slice(&sr.to_le_bytes());
    w.extend_from_slice(&(sr * 2).to_le_bytes());   // byte rate
    w.extend_from_slice(&2u16.to_le_bytes());       // block align
    w.extend_from_slice(&16u16.to_le_bytes());      // bits per sample
    w.extend_from_slice(b"data");
    w.extend_from_slice(&data_len.to_le_bytes());
    for s in pcm { w.extend_from_slice(&s.to_le_bytes()); }
    w
}

// ─── Transcription ────────────────────────────────────────────────────────────

async fn transcribe(wav: Vec<u8>, model: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model.to_string())
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
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Whisper HTTP {}: {}", status, body));
    }

    let r: Resp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r.text.trim().to_string())
}
