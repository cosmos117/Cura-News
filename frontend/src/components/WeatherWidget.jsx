import { useEffect, useState } from "react";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudDrizzle,
  Zap,
  Thermometer,
} from "lucide-react";

/** Indian cities offered in the header weather dropdown. */
const CITIES = [
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { name: "Hyderabad", lat: 17.38, lon: 78.48 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Ahmedabad", lat: 23.02, lon: 72.57 },
  { name: "Pune", lat: 18.52, lon: 73.86 },
  { name: "Jaipur", lat: 26.91, lon: 75.79 },
  { name: "Lucknow", lat: 26.85, lon: 80.95 },
  { name: "Surat", lat: 21.17, lon: 72.83 },
  { name: "Nagpur", lat: 21.15, lon: 79.09 },
  { name: "Patna", lat: 25.59, lon: 85.14 },
  { name: "Bhopal", lat: 23.26, lon: 77.41 },
  { name: "Chandigarh", lat: 30.73, lon: 76.78 },
];

/** Open-Meteo weather-code -> (label, icon). No API key required. */
const WEATHER_CODES = {
  0: { label: "Clear", Icon: Sun },
  1: { label: "Mainly clear", Icon: Cloud },
  2: { label: "Partly cloudy", Icon: Cloud },
  3: { label: "Overcast", Icon: Cloud },
  45: { label: "Fog", Icon: CloudFog },
  48: { label: "Depositing rime fog", Icon: CloudFog },
  51: { label: "Light drizzle", Icon: CloudDrizzle },
  53: { label: "Drizzle", Icon: CloudDrizzle },
  55: { label: "Heavy drizzle", Icon: CloudDrizzle },
  56: { label: "Light freezing drizzle", Icon: CloudDrizzle },
  57: { label: "Freezing drizzle", Icon: CloudDrizzle },
  61: { label: "Slight rain", Icon: CloudRain },
  63: { label: "Rain", Icon: CloudRain },
  65: { label: "Heavy rain", Icon: CloudRain },
  66: { label: "Light freezing rain", Icon: CloudRain },
  67: { label: "Freezing rain", Icon: CloudRain },
  71: { label: "Slight snow", Icon: CloudSnow },
  73: { label: "Snow", Icon: CloudSnow },
  75: { label: "Heavy snow", Icon: CloudSnow },
  77: { label: "Snow grains", Icon: CloudSnow },
  80: { label: "Rain showers", Icon: CloudRain },
  81: { label: "Rain showers", Icon: CloudRain },
  82: { label: "Heavy rain showers", Icon: CloudRain },
  85: { label: "Snow showers", Icon: CloudSnow },
  86: { label: "Heavy snow showers", Icon: CloudSnow },
  95: { label: "Thunderstorm", Icon: Zap },
  96: { label: "Thunderstorm with hail", Icon: Zap },
  99: { label: "Thunderstorm with heavy hail", Icon: Zap },
};

/**
 * Header weather widget powered by Open-Meteo.
 * Lets the user pick an Indian city and shows its current condition.
 * No API key required.
 */
export default function WeatherWidget() {
  const stored = localStorage.getItem("curaWeatherCity");
  const defaultCity = CITIES.find((c) => c.name === stored) || CITIES[0];
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("curaWeatherCity", selectedCity.name);
  }, [selectedCity.name]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchWeather = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(selectedCity.lat));
        url.searchParams.set("longitude", String(selectedCity.lon));
        url.searchParams.set("current_weather", "true");
        url.searchParams.set("temperature_unit", "celsius");

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error("Weather service unavailable");
        const data = await res.json();
        if (cancelled) return;
        setWeather({
          temperature: Math.round(data.current_weather?.temperature ?? 0),
          weathercode: data.current_weather?.weathercode ?? 0,
          time: data.current_weather?.time ?? "",
        });
        setError(null);
      } catch (err) {
        if (cancelled || err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load weather");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeather();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCity]);

  const entry = weather ? WEATHER_CODES[weather.weathercode] : null;
  const Icon = entry?.Icon || Cloud;

  if (error) {
    return (
      <div className="weather-widget weather-widget--error" title={error}>
        <Thermometer className="icon icon--sm" /> Weather unavailable
      </div>
    );
  }

  return (
    <div className="weather-widget" aria-label={`Weather in ${selectedCity.name}`}>
      <select
        value={selectedCity.name}
        onChange={(e) => {
          const picked = CITIES.find((c) => c.name === e.target.value);
          setSelectedCity(picked || selectedCity);
        }}
        className="weather-widget__city"
        aria-label="Select city"
      >
        {CITIES.map((city) => (
          <option key={city.name} value={city.name}>{city.name}</option>
        ))}
      </select>
      <div className="weather-widget__temp">
        {loading ? (
          <Thermometer className="icon icon--sm animate-pulse" /> 
        ) : (
          <>
            {weather?.temperature}°C
          </>
        )}
      </div>
      <div className="weather-widget__condition">
        {loading ? (
          <span>Loading…</span>
        ) : (
          <>
            <Icon className="icon icon--sm" /> {entry?.label ?? "—"}
          </>
        )}
      </div>
    </div>
  );
}
