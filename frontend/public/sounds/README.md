# Alert sounds

`booking-chime.mp3` is played by `OwnerAlertProvider` when a booking lands while
an owner dashboard tab is open.

Requirements:
- Short (under 2 seconds) — it repeats until acknowledged.
- Loud and mid-to-high frequency, audible over a room of gaming PCs.
- Distinct from a phone ringtone, so counter staff do not reach for their pocket.

The file is not committed yet. Until it exists the provider logs a warning and
falls back to the OS notification sound; nothing else breaks.
