import { CampusGeofence } from '../types';

// PSNA College of Engineering and Technology, Kothandaraman Nagar, Dindigul
export const DEFAULT_CAMPUS_GEOFENCE: CampusGeofence = {
  lat: 10.4158,
  lng: 77.9024,
  radiusMeters: 500,
  label: 'PSNA College Campus, Dindigul',
};

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function getBrowserLocation(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    const formatError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        return new Error(
          'Location permission was denied. Please allow location access in your browser site settings to verify classroom presence.'
        );
      }
      if (err.code === err.POSITION_UNAVAILABLE) {
        return new Error('Location information is unavailable from your device GPS/network.');
      }
      if (err.code === err.TIMEOUT) {
        return new Error('Location request timed out. Please try again.');
      }
      return new Error('Unable to retrieve your location.');
    };

    const onSuccess = (pos: GeolocationPosition) => {
      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      });
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        // Retry with network/Wi-Fi accuracy when high-accuracy GPS times out or is unavailable indoors
        if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (fallbackErr) => reject(formatError(fallbackErr)),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
          );
          return;
        }
        reject(formatError(err));
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 }
    );
  });
}
