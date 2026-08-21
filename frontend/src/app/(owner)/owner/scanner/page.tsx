'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import Script from 'next/script';
import { AnimatePresence, motion } from 'framer-motion';
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  User,
  Clock,
  Monitor,
  RefreshCw,
  Camera,
  Layers,
  VideoOff,
  Upload,
  SwitchCamera,
  WifiOff,
  HelpCircle,
  Phone,
  XCircle,
  Hash,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, Button, Input } from '@/components/ui';
import { checkinBooking } from '@/lib/api/owner';
import { validateQRCode, searchCheckinCandidates, type QRValidationResponse, type CheckinCandidate } from '@/lib/api/scanner';
import { ApiError } from '@/lib/api/errors';

type CheckinMethod = 'qr_camera' | 'qr_upload' | 'manual';

interface Html5QrcodeCameraDevice {
  id: string;
  label: string;
}

interface Html5QrcodeScannerConfig {
  fps?: number;
  qrbox?:
    | number
    | { width: number; height: number }
    | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number });
  aspectRatio?: number;
  disableFlip?: boolean;
}

interface Html5QrcodeInstance {
  start: (
    cameraIdOrConfig: string | { facingMode: string },
    config: Html5QrcodeScannerConfig,
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  scanFile: (imageFile: File, showImage?: boolean) => Promise<string>;
}

interface Html5QrcodeConstructor {
  new (elementId: string, verbose?: boolean): Html5QrcodeInstance;
  getCameras: () => Promise<Html5QrcodeCameraDevice[]>;
}

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeConstructor;
  }
}

// One overlay "kind" per server verdict. Everything here is a straight
// presentation mapping of what the backend already told us — no new
// eligibility rules are computed on the client.
type OverlayKind =
  | 'loading'
  | 'offline'
  | 'server_error'
  | 'invalid_qr'
  | 'forbidden'
  | 'too_early'
  | 'window_closed'
  | 'invalid_status'
  | 'already_checked_in'
  | 'checked_in_now'
  | 'ready';

interface OverlayPresentation {
  icon: LucideIcon;
  headline: string;
  bg: string;
  iconColor: string;
  textColor: string;
}

const OVERLAY_PRESENTATION: Record<OverlayKind, OverlayPresentation> = {
  loading: {
    icon: RefreshCw,
    headline: 'Verifying Pass…',
    bg: 'bg-surface-hover',
    iconColor: 'text-text-tertiary',
    textColor: 'text-text-primary',
  },
  offline: {
    icon: WifiOff,
    headline: "Couldn't Verify This Pass",
    bg: 'bg-slate-500/10',
    iconColor: 'text-slate-500',
    textColor: 'text-slate-600',
  },
  server_error: {
    icon: WifiOff,
    headline: "Couldn't Verify This Pass",
    bg: 'bg-slate-500/10',
    iconColor: 'text-slate-500',
    textColor: 'text-slate-600',
  },
  invalid_qr: {
    icon: HelpCircle,
    headline: 'Invalid or Unrecognized QR Code',
    bg: 'bg-slate-500/10',
    iconColor: 'text-slate-500',
    textColor: 'text-slate-600',
  },
  forbidden: {
    icon: XCircle,
    headline: 'Wrong Café',
    bg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    textColor: 'text-rose-600',
  },
  too_early: {
    icon: Clock,
    headline: "Booking Hasn't Started Yet",
    bg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    textColor: 'text-amber-600',
  },
  window_closed: {
    icon: XCircle,
    headline: 'Booking Expired',
    bg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    textColor: 'text-rose-600',
  },
  invalid_status: {
    icon: AlertCircle,
    headline: "Can't Check In This Booking",
    bg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    textColor: 'text-rose-600',
  },
  already_checked_in: {
    icon: ShieldCheck,
    headline: 'Already Checked In',
    bg: 'bg-sky-500/10',
    iconColor: 'text-sky-500',
    textColor: 'text-sky-600',
  },
  checked_in_now: {
    icon: CheckCircle2,
    headline: 'Checked In!',
    bg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    textColor: 'text-emerald-600',
  },
  ready: {
    icon: CheckCircle2,
    headline: 'Valid Pass',
    bg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    textColor: 'text-emerald-600',
  },
};

export default function ScannerPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [manualQuery, setManualQuery] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<QRValidationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The backend's error code + HTTP status for the current errorMessage, so
  // the overlay can pick the right headline/color/actions without inventing
  // any client-side logic — it only ever branches on what the server said.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  // Last thing we asked the server to validate — lets "Try Again" (network /
  // 5xx) retry the exact same code instead of forcing a rescan.
  const [lastAttempt, setLastAttempt] = useState<{ input: string; method: CheckinMethod } | null>(null);
  const [isCheckinSubmitting, setIsCheckinSubmitting] = useState(false);
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Html5QrcodeCameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Which method produced the current validationResult — sent along with the
  // check-in so the record honestly reflects how staff found this booking,
  // instead of always saying "owner_desk".
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod>('manual');
  // Distinguishes "no internet" from "this pass is invalid" — staff need to
  // know which one they're looking at, not read the same red banner for both.
  const [isOffline, setIsOffline] = useState(false);
  // Nudge shown after several seconds of the camera running with no
  // successful scan — bad lighting or a damaged QR shouldn't leave staff
  // stuck watching a live feed with no way out.
  const [showScanStuckHint, setShowScanStuckHint] = useState(false);
  const scanStuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual lookup — live search by name / phone / reference
  const [manualResults, setManualResults] = useState<CheckinCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedManualQuery = useDebounce(manualQuery, 350);

  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Whether a scan result (or an in-flight lookup) is currently occupying the
  // overlay. Read from a ref inside the camera's onSuccess callback — that
  // callback is captured once when the camera starts, so it can't see fresh
  // render-scope state — to stop the camera from firing another validate
  // call for every frame it re-reads the same still-visible QR pass.
  const resultShowingRef = useRef(false);
  useEffect(() => {
    resultShowingRef.current = Boolean(
      isValidating || isOffline || errorMessage || validationResult
    );
  }, [isValidating, isOffline, errorMessage, validationResult]);

  const clearScanStuckTimer = () => {
    if (scanStuckTimerRef.current) {
      clearTimeout(scanStuckTimerRef.current);
      scanStuckTimerRef.current = null;
    }
    setShowScanStuckHint(false);
  };

  const startScanStuckTimer = () => {
    clearScanStuckTimer();
    scanStuckTimerRef.current = setTimeout(() => {
      setShowScanStuckHint(true);
    }, 8_000);
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Already stopped or not running
      }
      try {
        scannerRef.current.clear();
      } catch {
        // Ignore clearing error
      }
      scannerRef.current = null;
    }
  };

  const startCamera = async (overrideCameraId?: string) => {
    if (!window.Html5Qrcode) {
      setCameraError('Scanner library loading, please wait...');
      setCameraState('loading');
      return;
    }

    const container = document.getElementById('qr-reader-target');
    if (!container) {
      setCameraError('Camera viewport container not ready.');
      setCameraState('error');
      return;
    }

    await stopCamera();

    setCameraState('loading');
    setCameraError(null);

    try {
      // Discover available cameras
      let devices: Html5QrcodeCameraDevice[] = [];
      try {
        devices = await window.Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setAvailableCameras(devices);
        }
      } catch (enumErr) {
        console.warn('Camera enumeration error:', enumErr);
      }

      const html5Qrcode = new window.Html5Qrcode('qr-reader-target');
      scannerRef.current = html5Qrcode;

      const qrConfig: Html5QrcodeScannerConfig = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.max(180, Math.floor(minEdge * 0.7));
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
      };

      const handleScanSuccess = (decodedText: string) => {
        if (resultShowingRef.current) return;
        clearScanStuckTimer();
        handleValidate(decodedText, 'qr_camera');
      };

      // Determine camera target
      const camIdToUse = overrideCameraId || selectedCameraId;

      if (camIdToUse) {
        await html5Qrcode.start(camIdToUse, qrConfig, handleScanSuccess, () => {});
      } else if (devices.length > 0) {
        // If multiple cameras exist, prefer back camera if present
        const backCamera = devices.find((d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        const chosenId = backCamera ? backCamera.id : devices[0].id;
        setSelectedCameraId(chosenId);
        await html5Qrcode.start(chosenId, qrConfig, handleScanSuccess, () => {});
      } else {
        // Try environment facing mode first, fall back to user camera
        try {
          await html5Qrcode.start(
            { facingMode: 'environment' },
            qrConfig,
            handleScanSuccess,
            () => {}
          );
        } catch {
          await html5Qrcode.start(
            { facingMode: 'user' },
            qrConfig,
            handleScanSuccess,
            () => {}
          );
        }
      }

      setCameraState('active');
      startScanStuckTimer();
    } catch (err: unknown) {
      console.error('Camera startup failed:', err);
      let msg = 'Could not access camera.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.message.toLowerCase().includes('permission')) {
          msg = 'Camera permission was denied. Please allow camera access in your browser address bar and click Retry.';
        } else if (err.name === 'NotFoundError' || err.message.toLowerCase().includes('notfound')) {
          msg = 'No camera found on this device. You can upload a QR pass image or use Manual Lookup.';
        } else {
          msg = err.message;
        }
      }
      setCameraError(msg);
      setCameraState('error');
    }
  };

  // Start camera when camera tab is active and script is ready
  useEffect(() => {
    if (activeTab === 'camera' && scriptLoaded) {
      startCamera();
    } else {
      stopCamera();
      clearScanStuckTimer();
      if (activeTab !== 'camera') {
        setCameraState('idle');
      }
    }

    return () => {
      stopCamera();
      clearScanStuckTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, scriptLoaded]);

  const handleCameraChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newCamId = e.target.value;
    setSelectedCameraId(newCamId);
    if (activeTab === 'camera') {
      await startCamera(newCamId);
    }
  };

  // Shared by handleValidate and handleCheckIn — the server is the source of
  // truth for every failure mode, so this only ever echoes its status/code/
  // message into state; it never computes or overrides what went wrong.
  const applyApiError = (err: unknown, fallbackMsg: string) => {
    if (err instanceof ApiError && err.status === 0) {
      setIsOffline(true);
      return;
    }
    if (err instanceof ApiError) {
      setErrorMessage(err.message);
      setErrorCode(err.code ?? null);
      setErrorStatus(err.status);
      return;
    }
    setErrorMessage(err instanceof Error ? err.message : fallbackMsg);
  };

  const handleValidate = async (qrInput: string, method: CheckinMethod = checkinMethod) => {
    if (!qrInput.trim()) return;

    setCheckinMethod(method);
    setLastAttempt({ input: qrInput, method });
    setIsValidating(true);
    setIsOffline(false);
    setErrorMessage(null);
    setErrorCode(null);
    setErrorStatus(null);
    setCheckinSuccessMsg(null);
    setValidationResult(null);

    try {
      const res = await validateQRCode(qrInput);
      if (!res.valid || !res.booking) {
        setErrorMessage(res.message || 'Invalid or unrecognized QR code pass.');
      } else {
        setValidationResult(res);
      }
    } catch (err: unknown) {
      applyApiError(err, 'Validation failed. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRetry = () => {
    if (lastAttempt) handleValidate(lastAttempt.input, lastAttempt.method);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.Html5Qrcode) {
      setErrorMessage('Scanner library loading. Please try again in a moment.');
      return;
    }

    setIsProcessingFile(true);
    setErrorMessage(null);
    setValidationResult(null);

    try {
      // Create a temporary instance to scan file
      const tempScanner = new window.Html5Qrcode('qr-reader-file-temp');
      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      if (decodedText) {
        await handleValidate(decodedText, 'qr_upload');
      } else {
        setErrorMessage('No valid QR code found in the selected image.');
      }
    } catch (scanErr: unknown) {
      console.warn('File QR scan failed:', scanErr);
      setErrorMessage('Could not find a valid QR code in this image. Try another photo or enter reference manually.');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleValidate(manualQuery, 'manual');
  };

  const handleSelectCandidate = (candidate: CheckinCandidate) => {
    setManualResults([]);
    handleValidate(candidate.id, 'manual');
  };

  // Live search by name / phone / partial reference as the staff member
  // types — the fallback for when a customer doesn't have their exact
  // booking reference handy.
  useEffect(() => {
    if (activeTab !== 'manual') return;
    const q = debouncedManualQuery.trim();
    if (q.length < 2) {
      setManualResults([]);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    searchCheckinCandidates(q)
      .then((results) => {
        if (!cancelled) setManualResults(results);
      })
      .catch(() => {
        if (!cancelled) setManualResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedManualQuery, activeTab]);

  const handleCheckIn = async (bookingId: string) => {
    setIsCheckinSubmitting(true);
    setCheckinSuccessMsg(null);
    setErrorMessage(null);
    setErrorCode(null);
    setErrorStatus(null);
    setIsOffline(false);

    try {
      await checkinBooking(bookingId, checkinMethod);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setCheckinSuccessMsg('Gamer checked in successfully!');
      if (validationResult?.booking) {
        setValidationResult({
          ...validationResult,
          alreadyCheckedIn: true,
          booking: {
            ...validationResult.booking,
            status: 'checked_in',
          },
        });
      }
    } catch (err: unknown) {
      // The backend is the security boundary for the check-in window and café
      // scoping — the UI never computes this itself, it only echoes the
      // server's code/message (which names the actual session start time)
      // into the overlay.
      applyApiError(err, 'Check-in failed. Please try again.');
    } finally {
      setIsCheckinSubmitting(false);
    }
  };

  const resetState = () => {
    setValidationResult(null);
    setErrorMessage(null);
    setErrorCode(null);
    setErrorStatus(null);
    setCheckinSuccessMsg(null);
    setManualQuery('');
    setManualResults([]);
    setIsOffline(false);
    setLastAttempt(null);
  };

  // Dismiss the overlay and re-arm the camera for the next scan.
  const handleDismiss = () => {
    resetState();
    startScanStuckTimer();
  };

  // Translate current state into exactly one overlay kind. Priority order:
  // an in-flight lookup, then a hard failure (offline/error), then a
  // successful lookup's booking status. Every branch reads only fields the
  // server already gave us.
  const resolveOverlayKind = (): OverlayKind | null => {
    if (isValidating) return 'loading';
    if (isOffline) return 'offline';
    if (errorMessage) {
      if (errorCode === 'CHECKIN_TOO_EARLY') return 'too_early';
      if (errorCode === 'CHECKIN_WINDOW_CLOSED') return 'window_closed';
      if (errorCode === 'INVALID_BOOKING_STATUS') return 'invalid_status';
      if (errorCode === 'FORBIDDEN') return 'forbidden';
      if (errorStatus !== null && errorStatus >= 500) return 'server_error';
      return 'invalid_qr';
    }
    if (validationResult?.booking) {
      if (checkinSuccessMsg) return 'checked_in_now';
      if (validationResult.alreadyCheckedIn) return 'already_checked_in';
      return 'ready';
    }
    return null;
  };

  const overlayKind = resolveOverlayKind();
  const overlayBooking = validationResult?.booking ?? null;

  return (
    <div className="max-w-3xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-6">
      <Script
        src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Hidden container for file decoding */}
      <div id="qr-reader-file-temp" className="hidden" />

      {/* Header */}
      <div className="border-b border-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <QrCode className="h-6 w-6 text-emerald-500" />
            <span>Station Check-In &amp; Pass Scanner</span>
          </h1>
          <p className="text-caption text-text-secondary mt-1">
            Scan customer QR digital passes, upload QR pass images, or look up booking references for 1-tap check-in.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="grid grid-cols-3 rounded-2xl bg-surface border border-border p-1 gap-1">
        <button
          onClick={() => {
            setActiveTab('camera');
            resetState();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-caption font-semibold transition-all ${
            activeTab === 'camera'
              ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">Camera Scanner</span>
          <span className="sm:hidden">Camera</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('upload');
            resetState();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-caption font-semibold transition-all ${
            activeTab === 'upload'
              ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Upload QR Image</span>
          <span className="sm:hidden">Upload</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('manual');
            resetState();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-caption font-semibold transition-all ${
            activeTab === 'manual'
              ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Manual Lookup</span>
          <span className="sm:hidden">Lookup</span>
        </button>
      </div>

      {/* Main Scanner Container */}
      <Card elevation="raised" className="bg-surface border border-border overflow-hidden">
        <CardContent className="p-6 flex flex-col gap-6">
          {activeTab === 'camera' && (
            <div className="flex flex-col items-center gap-4">
              {/* Camera Switcher if multiple devices */}
              {availableCameras.length > 1 && (
                <div className="w-full max-w-md flex items-center gap-2">
                  <SwitchCamera className="h-4 w-4 text-text-tertiary" />
                  <select
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    className="flex-1 h-9 px-3 text-xs rounded-xl border border-border bg-card font-body text-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {availableCameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Camera ${cam.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Camera viewport */}
              <div className="w-full max-w-md rounded-2xl bg-black border-2 border-dashed border-border overflow-hidden relative min-h-[300px] flex items-center justify-center">
                {/* Container where html5-qrcode attaches video stream */}
                <div id="qr-reader-target" className="w-full h-full min-h-[300px]" />

                {/* Loading overlay */}
                {cameraState === 'loading' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 text-white z-10">
                    <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
                    <span className="text-caption font-medium text-slate-300">Initializing camera feed...</span>
                  </div>
                )}

                {/* Error overlay */}
                {cameraState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center z-10">
                    <VideoOff className="h-10 w-10 text-rose-400" />
                    <p className="text-caption text-slate-300 max-w-xs">{cameraError}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startCamera()}
                        className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry Camera
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTab('upload')}
                        className="gap-1.5"
                      >
                        <Upload className="h-4 w-4" />
                        Upload Image
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-caption text-text-tertiary text-center">
                Point your camera or laptop webcam directly at the customer&apos;s digital QR pass.
              </p>

              {showScanStuckHint && cameraState === 'active' && (
                <div className="w-full max-w-md p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center gap-3">
                  <HelpCircle className="h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-caption font-semibold">Having trouble scanning?</p>
                    <p className="text-xs text-amber-600/80 mt-0.5">Bad lighting or a damaged pass? Try another way.</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('upload')} className="gap-1.5 text-xs h-7">
                      <Upload className="h-3.5 w-3.5" /> Upload
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('manual')} className="gap-1.5 text-xs h-7">
                      <Search className="h-3.5 w-3.5" /> Lookup
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center gap-6 py-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="qr-file-input"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-md border-2 border-dashed border-border hover:border-emerald-500/50 bg-card hover:bg-surface-hover rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all text-center"
              >
                <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  {isProcessingFile ? (
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  ) : (
                    <Upload className="h-8 w-8" />
                  )}
                </div>

                <div>
                  <h3 className="font-heading text-body font-bold text-text-primary">
                    {isProcessingFile ? 'Decoding QR Code...' : 'Choose or Drop QR Pass Image'}
                  </h3>
                  <p className="text-caption text-text-secondary mt-1">
                    Upload a screenshot or photo of the gamer&apos;s booking QR pass.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={isProcessingFile}
                  loadingText="Scanning..."
                  className="pointer-events-none mt-2"
                >
                  Browse Image
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="flex flex-col gap-4">
              <form onSubmit={handleManualSearchSubmit} className="flex flex-col gap-4">
                <Input
                  label="Name, Phone, or Booking Reference *"
                  placeholder="e.g. Rahul, 98765 43210, or GC-2026-6R0NZF"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  leftIcon={<Search className="h-4 w-4 text-text-tertiary" />}
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isValidating}
                  loadingText="Searching Booking..."
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-2"
                >
                  <Search className="h-4 w-4" />
                  <span>Lookup Exact Reference</span>
                </Button>
              </form>

              {/* Live results — matches today's bookings at this café by name/phone/reference */}
              {manualQuery.trim().length >= 2 && (
                <div className="flex flex-col gap-2">
                  {isSearching && (
                    <p className="text-caption text-text-tertiary flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Searching today&apos;s bookings…
                    </p>
                  )}

                  {!isSearching && manualResults.length === 0 && (
                    <p className="text-caption text-text-tertiary">
                      No matching bookings today for &quot;{manualQuery.trim()}&quot;.
                    </p>
                  )}

                  {manualResults.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => handleSelectCandidate(candidate)}
                      className="w-full text-left p-3.5 rounded-2xl bg-card border border-border hover:border-emerald-500/50 hover:bg-surface-hover transition-all flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {candidate.gamerName[0]?.toUpperCase() || 'G'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-caption font-bold text-text-primary truncate">{candidate.gamerName}</span>
                          <span className="text-xs text-text-tertiary flex items-center gap-1">
                            {candidate.gamerPhone && (
                              <span className="flex items-center gap-0.5">
                                <Phone className="h-3 w-3" /> {candidate.gamerPhone}
                              </span>
                            )}
                            <span>· {candidate.bookingReference}</span>
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-text-secondary shrink-0">
                        {candidate.startTime}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      {/* ── Full-screen scan result overlay ─────────────────────────────
          Renders above the camera the instant a lookup starts, so staff
          never scroll to see the verdict or the primary action. Every
          headline/color/action below is keyed off `overlayKind`, which is
          derived purely from state the backend already gave us. */}
      <AnimatePresence>
        {overlayKind && (
          <div className="fixed inset-0 z-overlay flex items-end sm:items-center justify-center">
            <motion.div
              className="absolute inset-0 bg-secondary/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={overlayKind !== 'loading' ? handleDismiss : undefined}
              aria-hidden="true"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full sm:max-w-lg mx-auto rounded-t-3xl sm:rounded-3xl bg-card shadow-overlay flex flex-col min-h-[62vh] max-h-[92vh] overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="h-1.5 w-12 rounded-full bg-border" />
              </div>

              {/* Scrollable status + details area */}
              <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
                {/* Big status headline */}
                <div className={`rounded-3xl p-6 flex flex-col items-center text-center gap-2 ${OVERLAY_PRESENTATION[overlayKind].bg}`}>
                  {(() => {
                    const Icon = OVERLAY_PRESENTATION[overlayKind].icon;
                    return (
                      <Icon
                        className={`h-16 w-16 ${OVERLAY_PRESENTATION[overlayKind].iconColor} ${
                          overlayKind === 'loading' ? 'animate-spin' : ''
                        }`}
                      />
                    );
                  })()}
                  <h2 className={`font-heading text-h1 font-extrabold ${OVERLAY_PRESENTATION[overlayKind].textColor}`}>
                    {OVERLAY_PRESENTATION[overlayKind].headline}
                  </h2>

                  {overlayKind === 'loading' && (
                    <p className="text-caption font-medium text-text-secondary">Checking this pass with the server…</p>
                  )}
                  {overlayKind === 'checked_in_now' && checkinSuccessMsg && (
                    <p className="text-caption font-semibold text-emerald-600/90">{checkinSuccessMsg}</p>
                  )}
                  {(overlayKind === 'too_early' ||
                    overlayKind === 'window_closed' ||
                    overlayKind === 'invalid_status' ||
                    overlayKind === 'forbidden' ||
                    overlayKind === 'invalid_qr' ||
                    overlayKind === 'server_error' ||
                    overlayKind === 'offline') &&
                    errorMessage && (
                      <p className={`text-caption font-medium ${OVERLAY_PRESENTATION[overlayKind].textColor}/90`}>
                        {errorMessage}
                      </p>
                    )}
                  {overlayKind === 'already_checked_in' && (
                    <p className="text-caption font-medium text-sky-600/90">
                      This pass was already checked in
                      {validationResult?.checkedInByName ? ` by ${validationResult.checkedInByName}` : ''}
                      {validationResult?.checkedInAt
                        ? ` at ${new Date(validationResult.checkedInAt).toLocaleTimeString()}`
                        : ''}
                      .
                    </p>
                  )}
                  {overlayKind === 'ready' && (
                    <p className="text-caption font-medium text-emerald-600/90">Ready for station check-in.</p>
                  )}
                </div>

                {/* Booking details — shown whenever we have a booking on hand,
                    regardless of whether a later check-in attempt failed. */}
                {overlayBooking && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface-hover border border-border">
                      <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-lg shrink-0">
                        {overlayBooking.gamerName[0]?.toUpperCase() || 'G'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-heading text-body font-bold text-text-primary truncate">
                          {overlayBooking.gamerName}
                        </span>
                        {overlayBooking.gamerPhone && (
                          <span className="text-caption text-text-secondary flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" /> {overlayBooking.gamerPhone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-caption">
                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5" /> Reference
                        </span>
                        <span className="font-semibold text-text-primary truncate">{overlayBooking.bookingReference}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" /> Status
                        </span>
                        <span className="font-semibold text-text-primary capitalize">{overlayBooking.status.replace(/_/g, ' ')}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" /> Date
                        </span>
                        <span className="font-semibold text-text-primary">{overlayBooking.sessionDate}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Time
                        </span>
                        <span className="font-semibold text-text-primary">
                          {overlayBooking.startTime} - {overlayBooking.endTime}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <Monitor className="h-3.5 w-3.5" /> Hardware Tier
                        </span>
                        <span className="font-semibold text-text-primary truncate">{overlayBooking.tierName}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                        <span className="text-text-tertiary text-xs flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" /> Seats
                        </span>
                        <span className="font-semibold text-text-primary">{overlayBooking.seatsCount} Seat(s)</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-hover border border-border flex items-center justify-between">
                      <span className="text-text-tertiary text-xs flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Amount Paid
                      </span>
                      <span className="font-bold text-emerald-600 text-body">₹{overlayBooking.totalAmount}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Thumb-reachable action bar, always pinned to the bottom */}
              {overlayKind !== 'loading' && (
                <div className="border-t border-border p-4 flex flex-col gap-2 shrink-0 safe-bottom bg-card">
                  {overlayKind === 'ready' && (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      isLoading={isCheckinSubmitting}
                      loadingText="Checking In..."
                      onClick={() => overlayBooking && handleCheckIn(overlayBooking.id)}
                      className="min-h-[56px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-2"
                    >
                      <ShieldCheck className="h-5 w-5" />
                      <span>Check In</span>
                    </Button>
                  )}

                  {(overlayKind === 'offline' || overlayKind === 'server_error') && (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      onClick={handleRetry}
                      className="min-h-[56px] font-bold gap-2"
                    >
                      <RefreshCw className="h-5 w-5" />
                      <span>Try Again</span>
                    </Button>
                  )}

                  <Button
                    variant={overlayKind === 'ready' || overlayKind === 'offline' || overlayKind === 'server_error' ? 'secondary' : 'primary'}
                    size="lg"
                    fullWidth
                    onClick={handleDismiss}
                    className="min-h-[56px] font-bold gap-2"
                  >
                    <QrCode className="h-5 w-5" />
                    <span>{overlayKind === 'ready' ? 'Cancel' : 'Scan Next'}</span>
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
