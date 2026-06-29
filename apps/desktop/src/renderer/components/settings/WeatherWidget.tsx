import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import type { VehicleType } from '../../stores/settings-store';
import { Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Sun, Wind, Eye, Droplets, Gauge } from 'lucide-react';

interface WeatherData {
  temp: number;
  windSpeed: number;
  windGusts: number;
  windDir: number;
  visibility: number;
  cloudCover: number;
  humidity: number;
  pressure: number;
  condition: string;
  waveHeight?: number;
  swellHeight?: number;
  swellDirection?: number;
  swellPeriod?: number;
}

const kmhToKnots = (kmh: number) => Math.round(kmh * 0.539957);

const weatherCache: { data: WeatherData | null; lat: number; lon: number; timestamp: number } = {
  data: null, lat: 0, lon: 0, timestamp: 0,
};

const WEATHER_CACHE_DURATION = 10 * 60 * 1000;
const WEATHER_LOCATION_THRESHOLD = 0.01;

export function WeatherWidget({ vehicleType }: { vehicleType?: VehicleType }) {
  const gps = useTelemetryStore((s) => s.gps);
  const [weather, setWeather] = useState<WeatherData | null>(weatherCache.data);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationSource, setLocationSource] = useState<'vehicle' | 'device' | null>(null);

  useEffect(() => {
    if (gps.lat !== 0 || gps.lon !== 0) {
      setLocationSource('vehicle');
      return;
    }
    const fetchIpLocation = async () => {
      try {
        const response = await fetch('http://ip-api.com/json/?fields=lat,lon,status');
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.lat && data.lon) {
            setUserLocation({ lat: data.lat, lon: data.lon });
            setLocationSource('device');
            return;
          }
        }
      } catch (err) {
        console.log('IP geolocation failed:', err);
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
            setLocationSource('device');
          },
          (error) => { console.log('Browser geolocation error:', error.message); },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
      }
    };
    fetchIpLocation();
  }, [gps.lat, gps.lon]);

  const effectiveLat = gps.lat !== 0 ? gps.lat : userLocation?.lat ?? 0;
  const effectiveLon = gps.lon !== 0 ? gps.lon : userLocation?.lon ?? 0;

  useEffect(() => {
    if (effectiveLat === 0 && effectiveLon === 0) return;
    const now = Date.now();
    const locationChanged = Math.abs(effectiveLat - weatherCache.lat) > WEATHER_LOCATION_THRESHOLD || Math.abs(effectiveLon - weatherCache.lon) > WEATHER_LOCATION_THRESHOLD;
    const cacheExpired = now - weatherCache.timestamp > WEATHER_CACHE_DURATION;
    if (weatherCache.data && !locationChanged && !cacheExpired) { setWeather(weatherCache.data); return; }
    if (now - weatherCache.timestamp < 30000) return;

    const fetchWeather = async () => {
      setLoading(true);
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${effectiveLat.toFixed(4)}&longitude=${effectiveLon.toFixed(4)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility,cloud_cover,relative_humidity_2m,surface_pressure`);
        if (!response.ok) { setLoading(false); return; }
        const data = await response.json();
        let marineData: Partial<WeatherData> = {};
        if (vehicleType === 'boat' || vehicleType === 'sub') {
          try {
            const marineResponse = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${effectiveLat.toFixed(4)}&longitude=${effectiveLon.toFixed(4)}&current=wave_height,swell_wave_height,swell_wave_direction,swell_wave_period`);
            if (marineResponse.ok) {
              const marine = await marineResponse.json();
              if (marine.current) {
                marineData = { waveHeight: marine.current.wave_height, swellHeight: marine.current.swell_wave_height, swellDirection: marine.current.swell_wave_direction, swellPeriod: marine.current.swell_wave_period };
              }
            }
          } catch (marineErr) { console.warn('Marine API failed:', marineErr); }
        }
        if (data.current) {
          const weatherCode = data.current.weather_code;
          let condition = 'Clear';
          if (weatherCode >= 95) condition = 'Thunderstorm';
          else if (weatherCode >= 71 && weatherCode <= 77) condition = 'Snow';
          else if (weatherCode >= 51) condition = 'Rain';
          else if (weatherCode >= 45) condition = 'Fog';
          else if (weatherCode >= 3) condition = 'Cloudy';
          else if (weatherCode >= 1) condition = 'Partly Cloudy';
          const weatherData: WeatherData = {
            temp: Math.round(data.current.temperature_2m), windSpeed: Math.round(data.current.wind_speed_10m),
            windGusts: Math.round(data.current.wind_gusts_10m || data.current.wind_speed_10m), windDir: data.current.wind_direction_10m,
            visibility: Math.round((data.current.visibility || 10000) / 1000), cloudCover: Math.round(data.current.cloud_cover || 0),
            humidity: Math.round(data.current.relative_humidity_2m || 0), pressure: Math.round(data.current.surface_pressure || 1013),
            condition, ...marineData,
          };
          weatherCache.data = weatherData; weatherCache.lat = effectiveLat; weatherCache.lon = effectiveLon; weatherCache.timestamp = now;
          setWeather(weatherData);
        }
      } catch (err) { console.error('Failed to fetch weather:', err); }
      setLoading(false);
    };
    fetchWeather();
    const interval = setInterval(() => { if (Date.now() - weatherCache.timestamp > WEATHER_CACHE_DURATION) fetchWeather(); }, WEATHER_CACHE_DURATION);
    return () => clearInterval(interval);
  }, [effectiveLat, effectiveLon, vehicleType]);

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  if (effectiveLat === 0 && effectiveLon === 0) {
    return (
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5 flex flex-col items-center justify-center text-center min-h-[200px]">
        <Cloud size={32} className="text-content-tertiary mb-2" />
        <p className="text-sm text-content-secondary">No GPS data</p>
        <p className="text-xs text-content-tertiary mt-1">Weather requires vehicle or device location</p>
      </section>
    );
  }

  if (loading && !weather) {
    return (
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5 flex items-center justify-center min-h-[200px]">
        <div className="flex items-center gap-2 text-content-secondary text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading weather...
        </div>
      </section>
    );
  }

  if (!weather) return null;

  const isAirVehicle = !vehicleType || ['copter', 'plane', 'vtol'].includes(vehicleType);
  const isMaritime = vehicleType === 'boat' || vehicleType === 'sub';
  const windLimit = isAirVehicle ? 25 : 40;
  const gustLimit = isAirVehicle ? 35 : 50;
  const visibilityLimit = isAirVehicle ? 3 : 1;
  const isBad = weather.windSpeed >= windLimit || weather.windGusts >= gustLimit || weather.condition === 'Rain' || weather.condition === 'Thunderstorm' || weather.visibility < visibilityLimit;
  const isCaution = weather.windSpeed >= windLimit * 0.6 || weather.windGusts >= gustLimit * 0.7 || weather.condition === 'Fog' || weather.condition === 'Snow' || weather.visibility < visibilityLimit * 2;

  const WeatherIcon = () => {
    const iconClass = `w-10 h-10 ${isBad ? 'text-red-400' : isCaution ? 'text-amber-400' : weather.condition === 'Clear' ? 'text-yellow-400' : 'text-blue-400'}`;
    switch (weather.condition) {
      case 'Thunderstorm': return <CloudLightning className={iconClass} />;
      case 'Rain': return <CloudRain className={iconClass} />;
      case 'Snow': return <CloudSnow className={iconClass} />;
      case 'Fog': return <CloudFog className={iconClass} />;
      case 'Clear': return <Sun className={iconClass} />;
      default: return <Cloud className={iconClass} />;
    }
  };

  return (
    <section className={`rounded-xl border p-5 ${isBad ? 'bg-red-500/5 border-red-500/30' : isCaution ? 'bg-amber-500/5 border-amber-500/30' : 'bg-gradient-to-br from-surface to-surface-base border-subtle'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <WeatherIcon />
          <div>
            <div className="text-2xl font-bold text-content">{weather.temp}°C</div>
            <div className="text-xs text-content-secondary">{weather.condition}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-medium ${isBad ? 'text-red-400' : isCaution ? 'text-amber-400' : 'text-emerald-400'}`}>
            {isBad ? 'No-Go' : isCaution ? 'Caution' : 'Go'}
          </div>
          <div className="text-[10px] text-content-tertiary">{locationSource === 'vehicle' ? 'From FC GPS' : 'From device'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Wind size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Wind</span>
          <span className="text-content font-mono ml-auto">{weather.windSpeed} km/h {getWindDirection(weather.windDir)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Gusts</span>
          <span className={`font-mono ml-auto ${weather.windGusts >= gustLimit ? 'text-red-400' : 'text-content'}`}>{weather.windGusts} km/h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Eye size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Vis</span>
          <span className={`font-mono ml-auto ${weather.visibility < visibilityLimit ? 'text-red-400' : 'text-content'}`}>{weather.visibility} km</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Humid</span>
          <span className="text-content font-mono ml-auto">{weather.humidity}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Press</span>
          <span className="text-content font-mono ml-auto">{weather.pressure} hPa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cloud size={12} className="text-content-tertiary" />
          <span className="text-content-secondary">Cloud</span>
          <span className="text-content font-mono ml-auto">{weather.cloudCover}%</span>
        </div>
      </div>

      {isMaritime && (weather.waveHeight != null || weather.swellHeight != null) && (
        <div className="mt-3 pt-3 border-t border-subtle">
          <div className="text-[10px] text-content-secondary uppercase tracking-wider mb-2">Marine</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {weather.waveHeight != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-content-secondary">Waves</span>
                <span className="text-content font-mono ml-auto">{weather.waveHeight} m</span>
              </div>
            )}
            {weather.swellHeight != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-content-secondary">Swell</span>
                <span className="text-content font-mono ml-auto">{weather.swellHeight} m</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
