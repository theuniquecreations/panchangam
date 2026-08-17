/**
 * Type declarations for lib/astronomy.js (astronomy-engine).
 * Declares the module for both relative and alias imports.
 */

export enum Body {
    Sun = "Sun",
    Moon = "Moon",
    Mercury = "Mercury",
    Venus = "Venus",
    Earth = "Earth",
    Mars = "Mars",
    Jupiter = "Jupiter",
    Saturn = "Saturn",
    Uranus = "Uranus",
    Neptune = "Neptune",
    Pluto = "Pluto"
}

export class Observer {
    constructor(latitude: number, longitude: number, elevation: number);
    latitude: number;
    longitude: number;
    elevation: number;
}

export class AstroTime {
    constructor(date: Date | number);
    date: Date;
    ut: number;
    tt: number;
    AddDays(days: number): AstroTime;
}

export function MakeTime(date: Date | number | AstroTime): AstroTime;

export interface EclipticCoordinates {
    elon: number;
    elat: number;
}

export interface Spherical {
    lat: number;
    lon: number;
    dist: number;
}

export function SunPosition(date: Date | AstroTime): EclipticCoordinates;
export function EclipticGeoMoon(date: Date | AstroTime): Spherical;
/** Greenwich Apparent Sidereal Time, in sidereal hours (0..24). */
export function SiderealTime(date: Date | AstroTime): number;
export function SearchRiseSet(
    body: Body | string,
    observer: Observer,
    direction: number,
    start: Date | AstroTime,
    limitDays: number
): AstroTime | null;

export function MoonPhase(date: Date | AstroTime): number;
export function SearchMoonPhase(
    targetLon: number, 
    dateStart: Date | AstroTime, 
    limitDays: number
): AstroTime | null;

export interface SearchOptions {
    dt_tolerance_seconds?: number;
    init_f1?: number;
    init_f2?: number;
    iter_limit?: number;
}

export function Search(
    f: (time: AstroTime) => number,
    t1: AstroTime,
    t2: AstroTime,
    options?: SearchOptions
): AstroTime | null;
