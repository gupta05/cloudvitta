import { forwardRef, useImperativeHandle, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Shared OTP digit-group input used by OtpVerification and ResetPassword.
 * Controlled: parent owns the digit array (`value`) and passes `onChange`.
 * - digit-only input, auto-advance, backspace/arrow navigation, paste fill
 * - onComplete(code) fires when the last digit lands (or a full paste,
 *   unless submitOnPaste is false)
 * - exposes focusFirst() via ref for clear-and-retry flows
 */
const OtpInput = forwardRef(function OtpInput(
  { length = 6, value, onChange, onComplete, disabled = false, error = false, submitOnPaste = true, label = 'Verification code' },
  ref
) {
  const inputRefs = useRef([]);

  useImperativeHandle(ref, () => ({
    focusFirst: () => inputRefs.current[0]?.focus(),
  }));

  const handleChange = (index, digit) => {
    if (digit && !/^\d$/.test(digit)) return;
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < length - 1) inputRefs.current[index + 1]?.focus();
    if (digit && index === length - 1 && next.every((d) => d !== '')) {
      onComplete?.(next.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted.length === 0) return;
    const next = [...value];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    onChange(next);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
    if (submitOnPaste && pasted.length === length) onComplete?.(pasted);
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste} role="group" aria-label={label}>
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          className="w-12 h-14 text-center text-2xl font-bold rounded-lg border bg-cv-surface-2 text-cv-text
                     focus:outline-none focus:ring-2 focus:ring-cv-primary/50 focus:border-cv-primary
                     transition-all duration-200 font-mono
                     disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            borderColor: error
              ? 'color-mix(in srgb, var(--color-cv-danger) 50%, transparent)'
              : digit
              ? 'color-mix(in srgb, var(--color-cv-primary) 40%, transparent)'
              : 'var(--color-cv-border)',
            caretColor: 'var(--color-cv-primary)',
          }}
          autoFocus={index === 0}
        />
      ))}
    </div>
  );
});

export default OtpInput;

/** Countdown bar for OTP expiry (green → warning → danger as time runs out). */
export function OtpExpiryBar({ timeLeft, totalSeconds }) {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (timeLeft <= 0) {
    return <p className="text-xs text-cv-danger" role="alert">Code expired. Please request a new one.</p>;
  }

  const barColor = timeLeft > 120 ? 'var(--color-cv-primary)' : timeLeft > 60 ? 'var(--color-cv-warning)' : 'var(--color-cv-danger)';
  return (
    <div className="flex items-center gap-2 text-xs text-cv-text-muted">
      <div className="w-full bg-cv-surface-2 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${(timeLeft / totalSeconds) * 100}%`, background: barColor }}
        />
      </div>
      <span className="shrink-0 tabular-nums font-mono" style={{ color: timeLeft > 120 ? undefined : barColor }}>
        {formatTime(timeLeft)}
      </span>
    </div>
  );
}

/** "Didn't receive the code?" resend affordance with cooldown. */
export function OtpResend({ cooldown, resending, onResend }) {
  return (
    <div className="mt-5 text-center">
      <p className="text-xs text-cv-text-muted mb-2">Didn&apos;t receive the code?</p>
      <button
        onClick={onResend}
        disabled={cooldown > 0 || resending}
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: cooldown > 0 ? 'var(--color-cv-text-muted)' : 'var(--color-cv-primary)' }}
      >
        <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
        {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
      </button>
    </div>
  );
}
