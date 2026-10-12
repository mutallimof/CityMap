import type { Map as MlMap } from 'maplibre-gl';
import { setCredit } from '../map/credit';

/** Open-Meteo's free API asks for this credit (data: CC BY 4.0). */
export const WEATHER_CREDIT = '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>';

/** Credit in the attribution bar whenever live weather is used (not for the ?weather= demo presets). */
export const showWeatherCredit = (map: MlMap, on: boolean): void => setCredit(map, 'weather-credit', WEATHER_CREDIT, on);
