'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { checkDeliveryEligibility, DEFAULT_MAX_RADIUS_KM } from '@/lib/delivery';
import { useCart } from '@/context/CartContext';

export default function LocationRadiusChecker({ onEligibilityChange }) {
  const { customerLocation, setCustomerLocation, orderType, setOrderType } = useCart();
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(null); // 'denied' | 'unavailable' | 'timeout' | null
  const [manualAddress, setManualAddress] = useState(customerLocation?.address || '');

  useEffect(() => {
    if (customerLocation && onEligibilityChange) {
      onEligibilityChange(customerLocation.isEligible, customerLocation);
    }
  }, [customerLocation, onEligibilityChange]);

  const requestLiveLocation = () => {
    if (!navigator.geolocation) {
      setErrorState('unavailable');
      return;
    }

    setLoading(true);
    setErrorState(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const result = checkDeliveryEligibility(latitude, longitude);

        const locationData = {
          lat: latitude,
          lng: longitude,
          distanceKm: result.distanceKm,
          isEligible: result.eligible,
          reason: result.reason,
          address: manualAddress || 'Live GPS Location Verified',
        };

        setCustomerLocation(locationData);
        setLoading(false);

        if (onEligibilityChange) {
          onEligibilityChange(result.eligible, locationData);
        }
      },
      (error) => {
        setLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorState('denied');
        } else if (error.code === error.TIMEOUT) {
          setErrorState('timeout');
        } else {
          setErrorState('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleManualAddressChange = (val) => {
    setManualAddress(val);
    if (customerLocation) {
      setCustomerLocation({
        ...customerLocation,
        address: val,
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
            <MapPin size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-zinc-900">Delivery Address & Radius Verification</h3>
            <p className="text-xs text-zinc-500">
              Fresh hot delivery available within <strong>{DEFAULT_MAX_RADIUS_KM} km</strong> of Model Town, Lahore
            </p>
          </div>
        </div>
      </div>

      {/* Geolocation Button */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs text-zinc-700">
            <span className="font-semibold block text-zinc-900">Verify Live Delivery Radius:</span>
            We use your live location to ensure your naan arrives piping hot from our tandoor.
          </div>

          <button
            type="button"
            onClick={requestLiveLocation}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-zinc-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Locating...
              </>
            ) : (
              <>
                <Navigation size={14} />
                {customerLocation?.distanceKm ? 'Update Location' : 'Detect My Location'}
              </>
            )}
          </button>
        </div>

        {/* Verification Status Banner */}
        {customerLocation && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
              customerLocation.isEligible
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {customerLocation.isEligible ? (
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5 flex-1">
              <div className="font-bold">
                {customerLocation.isEligible
                  ? `Delivery Available! (${customerLocation.distanceKm} km from shop)`
                  : `Outside Delivery Zone (${customerLocation.distanceKm} km from shop)`}
              </div>
              <p className="text-[11px] leading-relaxed">
                {customerLocation.reason}
              </p>
              {!customerLocation.isEligible && (
                <button
                  type="button"
                  onClick={() => setOrderType('pickup')}
                  className="mt-1.5 font-bold underline text-red-700 hover:text-red-800"
                >
                  Switch order to Pickup (Self-Collection)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error States */}
        {errorState === 'denied' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Location Permission Denied</span>
              <p className="text-[11px]">
                Please allow browser location permissions in your browser settings to verify you are within our 3 km delivery zone, or switch your order to Pickup.
              </p>
            </div>
          </div>
        )}

        {errorState === 'unavailable' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">GPS Location Unavailable</span>
              <p className="text-[11px]">
                We couldn&apos;t detect your location. Please check your device location services or place a Pickup order.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Street Address Input */}
      <div>
        <label className="block text-xs font-semibold text-zinc-700 mb-1">
          Detailed Delivery Street Address & House/Flat #
        </label>
        <textarea
          rows={2}
          value={manualAddress}
          onChange={(e) => handleManualAddressChange(e.target.value)}
          placeholder="e.g., House # 12, Block C, Model Town, Lahore (near Model Town Park Gate 2)"
          className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
        />
      </div>
    </div>
  );
}
