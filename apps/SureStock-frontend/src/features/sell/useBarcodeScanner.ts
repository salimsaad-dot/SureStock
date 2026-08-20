import { useEffect, useRef } from 'react'

const SCAN_MAX_INTERVAL_MS = 40
const MIN_SCAN_LENGTH = 4

/**
 * Doc 6 T-15: "a USB scanner adds an item without focusing any field."
 * A USB scanner is a keyboard-wedge device — it "types" the barcode
 * followed by Enter, just much faster than a human ever does. This
 * listens globally (not on a specific input) and buffers keys that
 * arrive faster than a human types; on Enter, a long enough fast burst
 * is treated as a scan and reported, everything else is left alone so
 * normal typing anywhere (the search box, a PIN field) is unaffected.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= MIN_SCAN_LENGTH) {
          onScan(bufferRef.current)
          bufferRef.current = ''
        }
        return
      }

      if (e.key.length !== 1) return // ignore Shift, Tab, arrows, etc.

      if (gap > SCAN_MAX_INTERVAL_MS) bufferRef.current = '' // too slow — real typing, restart
      bufferRef.current += e.key
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onScan, enabled])
}
