/// Tray icon setup for Wardyn.
/// Creates a macOS menu bar icon with context menu and left-click to show/hide window.

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};

/// Sets up the system tray icon with its context menu and event handlers.
pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    // Menu items
    let open_item = MenuItemBuilder::with_id("open", "Open Wardyn").build(app)?;
    let habits_item = MenuItemBuilder::with_id("habits", "Daily Habits").build(app)?;
    let quote_item = MenuItemBuilder::with_id("quote", "Today's Spark").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Wardyn").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&habits_item)
        .item(&quote_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    // Build tray icon — use bundled 32x32 icon
    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
            .expect("failed to load tray icon")
    });

    let _tray = TrayIconBuilder::with_id("wardyn-tray")
        .icon(icon)
        .icon_as_template(true) // macOS: renders in menu bar style (respects dark/light mode)
        .tooltip("Wardyn — Your Life Coach")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open" => show_window(app),
                "habits" => {
                    show_window(app);
                    // Tell the frontend to switch to active-life tab
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("switch-tab", "active-life");
                    }
                }
                "quote" => {
                    show_window(app);
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("switch-tab", "active-life");
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left click → toggle window visibility
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

/// Shows the main window and brings it to the front.
pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Toggles main window visibility — shows if hidden, hides if visible.
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

/// Updates the tray icon tooltip to reflect current habit completion state.
/// Called after habits are fetched or toggled.
pub fn update_tray_tooltip(app: &AppHandle, done: usize, total: usize) {
    if let Some(tray) = app.tray_by_id("wardyn-tray") {
        let msg = if total == 0 {
            "Wardyn — Your Life Coach".to_string()
        } else if done == total {
            format!("Wardyn ✅ All {} habits done!", total)
        } else {
            format!("Wardyn ⚡ {}/{} habits done", done, total)
        };
        let _ = tray.set_tooltip(Some(&msg));
    }
}
