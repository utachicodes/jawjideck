// validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateDevicePath, validateBaudRate, validatePort, sanitizeSystemdPath } from './validation.js';

describe('validation', () => {
  describe('validateDevicePath', () => {
    it('accepts valid serial devices', () => {
      expect(validateDevicePath('/dev/ttyACM0', 'serial')).toBe('/dev/ttyACM0');
      expect(validateDevicePath('/dev/ttyUSB0', 'serial')).toBe('/dev/ttyUSB0');
      expect(validateDevicePath('/dev/serial/by-id/usb-Arduino', 'serial')).toBe('/dev/serial/by-id/usb-Arduino');
    });

    it('accepts valid video devices', () => {
      expect(validateDevicePath('/dev/video0', 'video')).toBe('/dev/video0');
      expect(validateDevicePath('/dev/video42', 'video')).toBe('/dev/video42');
    });

    it('rejects newline injection', () => {
      expect(validateDevicePath('/dev/video0\nExecStart=/bin/bash', 'video')).toBeNull();
      expect(validateDevicePath('/dev/ttyACM0\r\n/etc/shadow', 'serial')).toBeNull();
    });

    it('rejects shell metacharacters', () => {
      expect(validateDevicePath('/dev/video0;rm -rf /', 'video')).toBeNull();
      expect(validateDevicePath('/dev/ttyACM0|cat /etc/passwd', 'serial')).toBeNull();
      expect(validateDevicePath('/dev/video0$(whoami)', 'video')).toBeNull();
      expect(validateDevicePath('/dev/video0`id`', 'video')).toBeNull();
    });

    it('rejects non-device paths', () => {
      expect(validateDevicePath('/etc/shadow', 'serial')).toBeNull();
      expect(validateDevicePath('/proc/self/environ', 'serial')).toBeNull();
      expect(validateDevicePath('/home/user/evil', 'video')).toBeNull();
    });

    it('rejects empty and oversized inputs', () => {
      expect(validateDevicePath('', 'serial')).toBeNull();
      expect(validateDevicePath('a'.repeat(300), 'serial')).toBeNull();
      expect(validateDevicePath(null, 'serial')).toBeNull();
      expect(validateDevicePath(undefined, 'serial')).toBeNull();
      expect(validateDevicePath(123, 'serial')).toBeNull();
    });
  });

  describe('validateBaudRate', () => {
    it('accepts valid baud rates', () => {
      expect(validateBaudRate(57600)).toBe(57600);
      expect(validateBaudRate(115200)).toBe(115200);
      expect(validateBaudRate('57600')).toBe(57600);
    });

    it('rejects invalid baud rates', () => {
      expect(validateBaudRate(12345)).toBeNull();
      expect(validateBaudRate(0)).toBeNull();
      expect(validateBaudRate(-1)).toBeNull();
      expect(validateBaudRate(NaN)).toBeNull();
      expect(validateBaudRate('evil')).toBeNull();
    });
  });

  describe('validatePort', () => {
    it('accepts valid ports', () => {
      expect(validatePort(1)).toBe(1);
      expect(validatePort(8080)).toBe(8080);
      expect(validatePort(65535)).toBe(65535);
    });

    it('rejects invalid ports', () => {
      expect(validatePort(0)).toBeNull();
      expect(validatePort(-1)).toBeNull();
      expect(validatePort(65536)).toBeNull();
      expect(validatePort(NaN)).toBeNull();
      expect(validatePort('evil')).toBeNull();
    });
  });

  describe('sanitizeSystemdPath', () => {
    it('accepts clean paths', () => {
      expect(sanitizeSystemdPath('/dev/video0')).toBe('/dev/video0');
      expect(sanitizeSystemdPath('/dev/ttyACM0')).toBe('/dev/ttyACM0');
    });

    it('rejects paths with spaces or special chars', () => {
      expect(sanitizeSystemdPath('/dev/video 0')).toBeNull();
      expect(sanitizeSystemdPath('/dev/video0;evil')).toBeNull();
      expect(sanitizeSystemdPath('/dev/video0\nExecStart=/bin/sh')).toBeNull();
    });
  });
});
