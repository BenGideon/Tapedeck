"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { QUALITY_MODES, type QualityMode } from "@/lib/media/quality";
import { detectBrowserSupport } from "@/lib/media/support";
import type { RecordingConfig } from "@/lib/media/recorder";

interface SetupPanelProps {
  onStart: (config: RecordingConfig) => void;
  onCancel: () => void;
}

interface DeviceOption {
  deviceId: string;
  label: string;
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-panel-2 transition-colors disabled:opacity-40"
    >
      <span className={`text-sm font-medium transition-colors duration-[130ms] ${checked ? "text-ink" : "text-ink-dim"}`}>
        {label}
      </span>
      {/* Track */}
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-[130ms] ${
          checked
            ? "bg-accent ring-2 ring-accent/30 ring-offset-1 ring-offset-panel"
            : "bg-edge"
        }`}
      >
        {/* Thumb */}
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md shadow-black/30 transition-transform duration-[130ms] ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function DeviceSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: DeviceOption[];
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mx-3 mb-2 w-[calc(100%-24px)] truncate rounded-md border border-edge-soft bg-panel-2 px-2 py-1.5 text-[13px] text-ink-dim"
    >
      {options.map((option) => (
        <option key={option.deviceId} value={option.deviceId}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SetupPanel({ onStart, onCancel }: SetupPanelProps) {
  const support = detectBrowserSupport();
  const [screen, setScreen] = useState(support.canRecordScreen);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(true);
  const [systemAudio, setSystemAudio] = useState(false);
  const [quality, setQuality] = useState<QualityMode>("standard");
  const [cameraDevices, setCameraDevices] = useState<DeviceOption[]>([]);
  const [micDevices, setMicDevices] = useState<DeviceOption[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [micDeviceId, setMicDeviceId] = useState("");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const toOption = (device: MediaDeviceInfo, index: number, kind: string): DeviceOption => ({
      deviceId: device.deviceId,
      label: device.label || `${kind} ${index + 1}`,
    });
    setCameraDevices(
      devices.filter((d) => d.kind === "videoinput").map((d, i) => toOption(d, i, "Camera")),
    );
    setMicDevices(
      devices.filter((d) => d.kind === "audioinput").map((d, i) => toOption(d, i, "Microphone")),
    );
  }, []);

  const stopPreview = useCallback(() => {
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  // Live camera preview while the camera toggle is on.
  useEffect(() => {
    let cancelled = false;
    if (!camera) {
      stopPreview();
      return;
    }
    (async () => {
      try {
        setPermissionError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stopPreview();
        previewStreamRef.current = stream;
        if (previewRef.current) previewRef.current.srcObject = stream;
        await refreshDevices();
      } catch {
        if (!cancelled) {
          setCamera(false);
          setPermissionError("Camera access was denied. You can still record without it.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camera, cameraDeviceId, refreshDevices, stopPreview]);

  // Unlock microphone labels once when the mic toggle is on.
  useEffect(() => {
    let cancelled = false;
    if (!mic) return;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        if (!cancelled) {
          setPermissionError(null);
          await refreshDevices();
        }
      } catch {
        if (!cancelled) {
          setMic(false);
          setPermissionError("Microphone access was denied. You can still record without it.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mic, refreshDevices]);

  useEffect(() => stopPreview, [stopPreview]);

  const canStart = (screen || camera) && support.supported;

  const handleStart = () => {
    stopPreview();
    onStart({
      screen,
      camera,
      mic,
      systemAudio: screen && systemAudio,
      cameraDeviceId: cameraDeviceId || undefined,
      micDeviceId: micDeviceId || undefined,
      quality,
    });
  };

  return (
    <div className="rise-in w-[340px] rounded-xl border border-edge bg-panel shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-edge-soft px-4 py-3">
        <h2 className="font-display text-[15px] font-medium">New recording</h2>
        <button
          onClick={onCancel}
          aria-label="Close"
          className="rounded-md p-1 text-ink-faint hover:bg-panel-2 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!support.supported && (
        <p className="mx-4 mt-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          {support.reason}
        </p>
      )}
      {permissionError && (
        <p className="mx-4 mt-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          {permissionError}
        </p>
      )}

      <div className="p-2">
        <Toggle label="Screen" checked={screen} onChange={setScreen} disabled={!support.canRecordScreen} />
        {screen && (
          <div className="px-3 pb-2">
            <Toggle label="Also capture tab / system audio" checked={systemAudio} onChange={setSystemAudio} />
            <p className="px-3 text-[12px] leading-snug text-ink-faint">
              You&apos;ll pick the screen, window, or tab in the next step.
            </p>
          </div>
        )}

        <Toggle label="Camera" checked={camera} onChange={setCamera} disabled={!support.canRecordCamera} />
        {camera && (
          <>
            <div className="mx-3 mb-2 flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-edge bg-bg">
                <video ref={previewRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
              </div>
              <p className="text-[12px] leading-snug text-ink-faint">
                {screen
                  ? "Recorded separately — move and resize the bubble after recording."
                  : "Records the camera full-frame."}
              </p>
            </div>
            <DeviceSelect ariaLabel="Camera device" value={cameraDeviceId} options={cameraDevices} onChange={setCameraDeviceId} />
          </>
        )}

        <Toggle label="Microphone" checked={mic} onChange={setMic} />
        {mic && (
          <DeviceSelect ariaLabel="Microphone device" value={micDeviceId} options={micDevices} onChange={setMicDeviceId} />
        )}
      </div>

      <div className="border-t border-edge-soft p-4">
        <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-faint">Quality</p>
        <div className="grid grid-cols-2 gap-1.5">
          {QUALITY_MODES.map((modeSpec) => (
            <button
              key={modeSpec.id}
              onClick={() => setQuality(modeSpec.id)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                quality === modeSpec.id
                  ? "border-accent/60 bg-panel-2"
                  : "border-edge-soft hover:border-edge"
              }`}
            >
              <span className="block text-[13px] font-medium text-ink">{modeSpec.label}</span>
              <span className="block text-[11px] leading-tight text-ink-faint">{modeSpec.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pt-0">
        <Button variant="rec" size="lg" className="w-full" disabled={!canStart} onClick={handleStart}>
          <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
          Start recording
        </Button>
        <p className="mt-3 text-center text-[12px] text-ink-faint">
          Recordings stay on this device unless you choose otherwise.
        </p>
      </div>
    </div>
  );
}
