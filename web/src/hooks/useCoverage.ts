'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { texasDate } from '@/lib/texas-time';
import {
  DEFAULT_COVERAGE,
  resolveCoverage,
  isListedMetroZip,
  extendedReachFeeLine,
  extendedReachRunDates,
  earliestExtendedReachRun,
  type Coverage,
  type CoverageResolution,
  type ExtendedReachQuote,
} from '@/lib/coverage';

/**
 * Coverage on screen (client 2026-10-07, request 8). The zones as Mission Control set them
 * (/api/coverage, the code defaults until it answers), and where an address is served
 * (/api/coverage/resolve: driving distance, Zone 5 fee and runs).
 */
export function useCoverage(): Coverage {
  const { data } = useQuery({
    queryKey: ['coverage'],
    queryFn: async (): Promise<Coverage> => {
      const res = await fetch('/api/coverage');
      if (!res.ok) throw new Error('Could not load coverage');
      return (await res.json()).coverage;
    },
    staleTime: 60 * 1000,
  });
  return data ?? DEFAULT_COVERAGE;
}

/** A Zone 5 quote from the local rules, before (or without) the server's answer. */
function localQuote(resolution: CoverageResolution, coverage: Coverage): ExtendedReachQuote | null {
  if (resolution.status !== 'served' || !resolution.band) return null;
  const reach = coverage.extendedReach;
  const line = extendedReachFeeLine(resolution.band, false, reach);
  const threshold = resolution.band.dispatchThreshold;
  return {
    band: resolution.band.id,
    fullFee: line?.fullFee ?? 0,
    routineFee: line?.routineFee ?? 0,
    routineDiscountPercent: reach.routineDiscountPercent,
    minimumOrder: reach.minimumOrder,
    threshold,
    runs: extendedReachRunDates(earliestExtendedReachRun(texasDate(), reach), 3, reach).map((date) => ({ date, booked: 0, threshold, dispatched: false })),
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export interface AddressCoverage {
  resolution: CoverageResolution;
  extendedReach: ExtendedReachQuote | null;
  /** Still checking the driving distance (not yet bookable) */
  checking: boolean;
}

export function useAddressCoverage({ street = '', city = '', zip }: { street?: string; city?: string; zip: string }, coverage: Coverage): AddressCoverage {
  const zip5 = (zip || '').replace(/[^\d]/g, '').slice(0, 5);
  const local = resolveCoverage({ zip: zip5 }, coverage);
  // A ZIP on a Zone 1-4 list is exact locally; anything else is placed by driving distance
  const needsServer = zip5.length === 5 && !isListedMetroZip(zip5, coverage);
  const key = useDebounced(`${street.trim().toLowerCase()}|${city.trim().toLowerCase()}|${zip5}`, 600);
  const keyIsCurrent = key === `${street.trim().toLowerCase()}|${city.trim().toLowerCase()}|${zip5}`;

  const { data, isFetching } = useQuery({
    queryKey: ['coverage-resolve', key],
    queryFn: async (): Promise<{ resolution: CoverageResolution; extendedReach: ExtendedReachQuote | null }> => {
      const [s, c, z] = key.split('|');
      const res = await fetch('/api/coverage/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street: s, city: c, zip: z }),
      });
      if (!res.ok) throw new Error('Could not check this address');
      return res.json();
    },
    enabled: needsServer && keyIsCurrent,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (!needsServer) return { resolution: local, extendedReach: null, checking: false };
  if (data && keyIsCurrent) return { resolution: data.resolution, extendedReach: data.extendedReach, checking: false };
  // Until the server answers: the ZIP-based guess, not yet bookable
  return { resolution: local, extendedReach: localQuote(local, coverage), checking: !keyIsCurrent || isFetching };
}
