export type GeoPermissionState = "granted" | "prompt" | "denied" | "unsupported";

type LocalityData = {
  city: string | null;
  principalSubdivision: string | null;
  countryName: string | null;
};

type CachedGeoContext = LocalityData & {
  lat: number;
  lon: number;
  accuracyM: number | null;
  savedAtISO: string;
};

export type WeatherSnapshot = LocalityData & {
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  isDay: boolean | null;
  fetchedAtISO: string;
};

const GEO_CACHE_KEY = "vivai:last-geo";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapGeoError(error: unknown): Error {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as GeolocationPositionError).code;
    switch (code) {
      case 1:
        return new Error("Permesso posizione negato.");
      case 2:
        return new Error("Posizione non disponibile.");
      case 3:
        return new Error("Timeout nella localizzazione.");
    }
  }
  return new Error("Impossibile ottenere la posizione.");
}

function getCurrentPosition(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 300000,
  }
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalizzazione non supportata dal browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export async function getGeolocationPermissionState(): Promise<GeoPermissionState> {
  if (!("geolocation" in navigator)) return "unsupported";

  if (!("permissions" in navigator) || !navigator.permissions?.query) {
    return "prompt";
  }

  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });

    if (
      status.state === "granted" ||
      status.state === "prompt" ||
      status.state === "denied"
    ) {
      return status.state;
    }

    return "prompt";
  } catch {
    return "prompt";
  }
}

async function getWeatherByCoords(
  lat: number,
  lon: number
): Promise<Omit<WeatherSnapshot, keyof LocalityData>> {
  const res = await fetch(
    `/api/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
      String(lon)
    )}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Errore recupero meteo.");
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    temperatureC: data.temperatureC ?? null,
    weatherCode: data.weatherCode ?? null,
    weatherLabel: data.weatherLabel ?? "Meteo aggiornato",
    isDay: typeof data.isDay === "boolean" ? data.isDay : null,
    fetchedAtISO: data.fetchedAtISO ?? new Date().toISOString(),
  };
}

/**
 * Chiamata solo con coordinate fresche del device.
 * Non usare coordinate vecchie/cached verso questo endpoint client-side.
 */
async function reverseGeocodeFreshCoords(
  lat: number,
  lon: number
): Promise<LocalityData> {
  const url = new URL("https://api-bdc.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("localityLanguage", "it");

  const res = await fetch(url.toString(), { method: "GET" });

  if (!res.ok) {
    return {
      city: null,
      principalSubdivision: null,
      countryName: null,
    };
  }

  const data = await res.json().catch(() => ({}));

  return {
    city: data.city || data.locality || null,
    principalSubdivision: data.principalSubdivision || null,
    countryName: data.countryName || null,
  };
}

export function getCachedGeoContext(): CachedGeoContext | null {
  return parseJson<CachedGeoContext>(localStorage.getItem(GEO_CACHE_KEY));
}

export async function loadWeatherFromCachedContext(): Promise<WeatherSnapshot | null> {
  const cached = getCachedGeoContext();
  if (!cached) return null;

  const weather = await getWeatherByCoords(cached.lat, cached.lon);

  return {
    ...weather,
    city: cached.city,
    principalSubdivision: cached.principalSubdivision,
    countryName: cached.countryName,
  };
}

export async function requestDeviceWeather(): Promise<WeatherSnapshot> {
  let position: GeolocationPosition;

  try {
    position = await getCurrentPosition();
  } catch (error) {
    throw mapGeoError(error);
  }

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  const [weather, locality] = await Promise.all([
    getWeatherByCoords(lat, lon),
    reverseGeocodeFreshCoords(lat, lon),
  ]);

  const cache: CachedGeoContext = {
    lat,
    lon,
    accuracyM: position.coords.accuracy ?? null,
    savedAtISO: new Date().toISOString(),
    ...locality,
  };

  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));

  return {
    ...weather,
    ...locality,
  };
}