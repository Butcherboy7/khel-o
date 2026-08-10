'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import Script from 'next/script';
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
} from 'lucide-react';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
import { checkinBooking } from '@/lib/api/owner';
import { validateQRCode, type QRValidationResponse } from '@/lib/api/scanner';

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

export default function ScannerPage() {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [manualQuery, setManualQuery] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<QRValidationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckinSubmitting, setIsCheckinSubmitting] = useState(false);
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Html5QrcodeCameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        handleValidate(decodedText);
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
      if (activeTab !== 'camera') {
        setCameraState('idle');
      }
    }

    return () => {
      stopCamera();
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

  const handleValidate = async (qrInput: string) => {
    if (!qrInput.trim()) return;

    setIsValidating(true);
    setErrorMessage(null);
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
      const msg = err instanceof Error ? err.message : 'Validation failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsValidating(false);
    }
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
        await handleValidate(decodedText);
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
    handleValidate(manualQuery);
  };

  const handleCheckIn = async (bookingId: string) => {
    setIsCheckinSubmitting(true);
    setCheckinSuccessMsg(null);
    setErrorMessage(null);

    try {
      await checkinBooking(bookingId);
      setCheckinSuccessMsg('✅ Gamer checked in successfully!');
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
      const msg = err instanceof Error ? err.message : 'Check-in failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsCheckinSubmitting(false);
    }
  };

  const resetState = () => {
    setValidationResult(null);
    setErrorMessage(null);
    setCheckinSuccessMsg(null);
    setManualQuery('');
  };

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
            <form onSubmit={handleManualSearchSubmit} className="flex flex-col gap-4">
              <Input
                label="Booking Reference Code or ID *"
                placeholder="e.g. GC-2026-6R0NZF or booking reference"
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
                <span>Lookup Booking Pass</span>
              </Button>
            </form>
          )}

          {/* Validation Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-caption font-semibold flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Check-In Success Message */}
          {checkinSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-caption font-semibold flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{checkinSuccessMsg}</span>
            </div>
          )}

          {/* Validation Result Card */}
          {validationResult && validationResult.booking && (
            <div className="flex flex-col gap-5 pt-2 border-t border-border mt-2">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-hover border border-border">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-lg">
                    {validationResult.booking.gamerName[0]?.toUpperCase() || 'G'}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-heading text-body font-bold text-text-primary">
                      {validationResult.booking.gamerName}
                    </span>
                    <span className="text-caption text-text-secondary">
                      Ref: <strong>{validationResult.booking.bookingReference}</strong>
                    </span>
                  </div>
                </div>

                <Badge
                  variant={
                    validationResult.alreadyCheckedIn
                      ? 'success'
                      : validationResult.booking.status === 'confirmed'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {validationResult.alreadyCheckedIn ? 'Checked In ✓' : validationResult.booking.status}
                </Badge>
              </div>

              {validationResult.alreadyCheckedIn && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-caption flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    This pass was already checked in
                    {validationResult.checkedInByName ? ` by ${validationResult.checkedInByName}` : ''}
                    {validationResult.checkedInAt
                      ? ` on ${new Date(validationResult.checkedInAt).toLocaleTimeString()}`
                      : ''}
                    .
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-caption">
                <div className="p-3.5 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                  <span className="text-text-tertiary text-xs flex items-center gap-1">
                    <Monitor className="h-3.5 w-3.5" /> Hardware Tier
                  </span>
                  <span className="font-semibold text-text-primary">{validationResult.booking.tierName}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                  <span className="text-text-tertiary text-xs flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Session Window
                  </span>
                  <span className="font-semibold text-text-primary">
                    {validationResult.booking.startTime} - {validationResult.booking.endTime} ({validationResult.booking.durationHours} hrs)
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                  <span className="text-text-tertiary text-xs flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> Station Seats
                  </span>
                  <span className="font-semibold text-text-primary">{validationResult.booking.seatsCount} Seat(s)</span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-hover border border-border flex flex-col gap-1">
                  <span className="text-text-tertiary text-xs flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> Amount Paid
                  </span>
                  <span className="font-semibold text-emerald-600 text-body">₹{validationResult.booking.totalAmount}</span>
                </div>
              </div>

              {!validationResult.alreadyCheckedIn && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isCheckinSubmitting}
                  onClick={() => handleCheckIn(validationResult.booking!.id)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-2 mt-2"
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>Confirm 1-Tap Station Check In</span>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
