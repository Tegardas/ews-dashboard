# EWS Dashboard - Monitoring Tanah Longsor

Dashboard real-time untuk memantau sistem Early Warning System (EWS) tanah longsor berbasis ESP32 dengan RTOS.

## 🚀 Fitur

- **Monitoring Real-time**: Data sensor tilt, kelembaban tanah, suhu, dan curah hujan
- **Analisis Risiko Otomatis**: Sistem scoring risiko tanah longsor
- **Alert Notifikasi**: Peringatan visual dan browser notification
- **Kontrol Perangkat**: Update threshold dan request data via MQTT
- **OTA Update Monitoring**: Pantau status firmware update
- **Responsive Design**: Akses dari desktop dan mobile

## 📡 Konfigurasi MQTT

Dashboard terhubung ke broker MQTT dengan konfigurasi:

- **Host**: `103.127.97.247`
- **Port**: `8084` (WebSocket Secured)
- **Username**: `rzkink_2554`
- **Password**: `rizkink1234`

## 🛠️ Deployment

### GitHub Pages

1. Fork repository ini
2. Enable GitHub Pages di settings repository
3. Akses dashboard di: `https://Tegardas.github.io/ews-dashboard`

### Local Development

```bash
# Clone repository
git clone https://github.com/Tegardas/ews-dashboard.git

# Buka index.html di browser
open index.html