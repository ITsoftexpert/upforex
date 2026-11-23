import { InjectionToken } from '@angular/core';
import type { Request, Response } from 'express';

// Request-scoped Express values supplied by CommonEngine for each render.
// Keep the existing language initialization and HTTP status behavior.
export const REQUEST = new InjectionToken<Request>('UPFOREX_SSR_REQUEST');
export const RESPONSE = new InjectionToken<Response>('UPFOREX_SSR_RESPONSE');
