/**
 * Byte-level readers for the blackbox log payload, mirroring the reference
 * decoders in blackbox-log-viewer's datastream.js / decoders.js
 * (https://github.com/betaflight/blackbox-log-viewer).
 *
 * All blackbox field encodings are byte-aligned on write, so no bit-level
 * buffering is required.
 */

export const EOF = -1;

/** Sign-extend a 24-bit value into a signed 32-bit JS number. */
export function signExtend24Bit(u: number): number {
  return u & 0x800000 ? u | 0xff000000 : u;
}

/** Sign-extend a 16-bit value into a signed 32-bit JS number. */
export function signExtend16Bit(word: number): number {
  return word & 0x8000 ? word | 0xffff0000 : word;
}

/** Sign-extend a 14-bit value into a signed 32-bit JS number. */
export function signExtend14Bit(word: number): number {
  return word & 0x2000 ? word | 0xffffc000 : word;
}

/** Sign-extend an 8-bit value into a signed 32-bit JS number. */
export function signExtend8Bit(byte: number): number {
  return byte & 0x80 ? byte | 0xffffff00 : byte;
}

/** Sign-extend a 7-bit value into a signed 32-bit JS number. */
export function signExtend7Bit(byte: number): number {
  return byte & 0x40 ? byte | 0xffffff80 : byte;
}

/** Sign-extend a 6-bit value into a signed 32-bit JS number. */
export function signExtend6Bit(byte: number): number {
  return byte & 0x20 ? byte | 0xffffffc0 : byte;
}

/** Sign-extend a 5-bit value into a signed 32-bit JS number. */
export function signExtend5Bit(byte: number): number {
  return byte & 0x10 ? byte | 0xffffffe0 : byte;
}

/** Sign-extend a 4-bit value into a signed 32-bit JS number. */
export function signExtend4Bit(nibble: number): number {
  return nibble & 0x08 ? nibble | 0xfffffff0 : nibble;
}

/** Sign-extend a 2-bit value into a signed 32-bit JS number. */
export function signExtend2Bit(byte: number): number {
  return byte & 0x02 ? byte | 0xfffffffc : byte;
}

/**
 * Stream over a Uint8Array with the readers the blackbox decoder needs.
 * Reading past the end sets `eof` and returns EOF (matching the reference
 * implementation) so corrupt frames desync instead of throwing.
 */
export class BlackboxStream {
  private data: Uint8Array;
  private _pos: number;
  private _end: number;
  private _start: number;
  eof = false;

  constructor(data: Uint8Array, start = 0, end = data.length) {
    this.data = data;
    this._start = start;
    this._pos = start;
    this._end = end;
  }

  get pos(): number {
    return this._pos;
  }

  set pos(value: number) {
    this._pos = value;
  }

  get start(): number {
    return this._start;
  }

  get end(): number {
    return this._end;
  }

  set end(value: number) {
    this._end = value;
  }

  /** Byte at absolute position `i` (0xFF when out of range). */
  dataAt(i: number): number {
    return this.data[i] ?? 0xff;
  }

  /** View over `[start, end)` of the underlying buffer. */
  subarray(start: number, end: number): Uint8Array {
    return this.data.subarray(start, end);
  }

  unreadChar(): void {
    this._pos--;
  }

  peekChar(): number {
    if (this._pos < this._end) return this.data[this._pos] ?? 0;
    this.eof = true;
    return EOF;
  }

  readByte(): number {
    if (this._pos < this._end) return this.data[this._pos++] ?? 0;
    this.eof = true;
    return EOF;
  }

  /** Read one byte as an ASCII character, or EOF. */
  readChar(): string | number {
    const b = this.readByte();
    return b === EOF ? EOF : String.fromCharCode(b);
  }

  readS8(): number {
    return signExtend8Bit(this.readByte());
  }

  readS16(): number {
    const b1 = this.readByte();
    const b2 = this.readByte();
    return signExtend16Bit(b1 | (b2 << 8));
  }

  readU16(): number {
    const b1 = this.readByte();
    const b2 = this.readByte();
    return b1 | (b2 << 8);
  }

  readU32(): number {
    const b1 = this.readByte();
    const b2 = this.readByte();
    const b3 = this.readByte();
    const b4 = this.readByte();
    return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
  }

  readString(length: number): string {
    const chars: string[] = [];
    for (let i = 0; i < length; i++) {
      const c = this.readChar();
      if (typeof c !== 'string') break;
      chars.push(c);
    }
    return chars.join('');
  }

  /**
   * Read a maximally 32-bit unsigned integer in Variable Byte format
   * (7 bits per byte, high bit = continuation).
   */
  readUnsignedVB(): number {
    let shift = 0;
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.readByte();
      if (b === EOF) return 0;
      result = result | ((b & ~0x80) << shift);
      if (b < 128) return result >>> 0;
      shift += 7;
    }
    return 0; // VB int too long
  }

  /** Read a zig-zag (signed) variable-byte value. */
  readSignedVB(): number {
    const unsigned = this.readUnsignedVB();
    return (unsigned >>> 1) ^ -(unsigned & 1);
  }

  /**
   * Read three fields in TAG2_3S32 encoding. Values are written as signed
   * 32-bit integers, with a 2-bit selector choosing 2/4/6-bit packed fields
   * or 8/16/24/32-bit fields.
   */
  readTag2_3S32(values: number[]): void {
    let leadByte = this.readByte();
    switch (leadByte >> 6) {
      case 0:
        values[0] = signExtend2Bit((leadByte >> 4) & 0x03);
        values[1] = signExtend2Bit((leadByte >> 2) & 0x03);
        values[2] = signExtend2Bit(leadByte & 0x03);
        break;
      case 1:
        values[0] = signExtend4Bit(leadByte & 0x0f);
        leadByte = this.readByte();
        values[1] = signExtend4Bit(leadByte >> 4);
        values[2] = signExtend4Bit(leadByte & 0x0f);
        break;
      case 2:
        values[0] = signExtend6Bit(leadByte & 0x3f);
        leadByte = this.readByte();
        values[1] = signExtend6Bit(leadByte & 0x3f);
        leadByte = this.readByte();
        values[2] = signExtend6Bit(leadByte & 0x3f);
        break;
      case 3:
        for (let i = 0; i < 3; i++) {
          switch (leadByte & 0x03) {
            case 0:
              values[i] = signExtend8Bit(this.readByte());
              break;
            case 1: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              values[i] = signExtend16Bit(b1 | (b2 << 8));
              break;
            }
            case 2: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              const b3 = this.readByte();
              values[i] = signExtend24Bit(b1 | (b2 << 8) | (b3 << 16));
              break;
            }
            case 3: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              const b3 = this.readByte();
              const b4 = this.readByte();
              values[i] = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
              break;
            }
          }
          leadByte >>= 2;
        }
        break;
    }
  }

  /**
   * Read three fields in TAG2_3SVARIABLE encoding (a compact variable-size
   * variant of TAG2_3S32).
   */
  readTag2_3SVariable(values: number[]): void {
    let leadByte = this.readByte();
    switch (leadByte >> 6) {
      case 0:
        values[0] = signExtend2Bit((leadByte >> 4) & 0x03);
        values[1] = signExtend2Bit((leadByte >> 2) & 0x03);
        values[2] = signExtend2Bit(leadByte & 0x03);
        break;
      case 1: {
        const leadByte2 = this.readByte();
        values[0] = signExtend5Bit((leadByte & 0x3e) >> 1);
        values[1] = signExtend5Bit(((leadByte & 0x01) << 5) | ((leadByte2 & 0x0f) >> 4));
        values[2] = signExtend4Bit(leadByte2 & 0x0f);
        break;
      }
      case 2: {
        const leadByte2 = this.readByte();
        const leadByte3 = this.readByte();
        values[0] = signExtend8Bit(((leadByte & 0x3f) << 2) | ((leadByte2 & 0xc0) >> 6));
        values[1] = signExtend7Bit(((leadByte2 & 0x3f) << 1) | ((leadByte2 & 0x80) >> 7));
        values[2] = signExtend7Bit(leadByte3 & 0x7f);
        break;
      }
      case 3:
        for (let i = 0; i < 3; i++) {
          switch (leadByte & 0x03) {
            case 0:
              values[i] = signExtend8Bit(this.readByte());
              break;
            case 1: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              values[i] = signExtend16Bit(b1 | (b2 << 8));
              break;
            }
            case 2: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              const b3 = this.readByte();
              values[i] = signExtend24Bit(b1 | (b2 << 8) | (b3 << 16));
              break;
            }
            case 3: {
              const b1 = this.readByte();
              const b2 = this.readByte();
              const b3 = this.readByte();
              const b4 = this.readByte();
              values[i] = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
              break;
            }
          }
          leadByte >>= 2;
        }
        break;
    }
  }

  /**
   * Read four fields in TAG8_4S16 encoding. `v1` is the pre-data-version-2
   * form (packed 4-bit pairs), `v2` the modern form (nibble-aligned).
   */
  readTag8_4S16(values: number[], version2: boolean): void {
    if (version2) this.readTag8_4S16_v2(values);
    else this.readTag8_4S16_v1(values);
  }

  private readTag8_4S16_v1(values: number[]): void {
    const FIELD_ZERO = 0;
    const FIELD_4BIT = 1;
    const FIELD_8BIT = 2;
    const FIELD_16BIT = 3;
    let selector = this.readByte();
    for (let i = 0; i < 4; i++) {
      switch (selector & 0x03) {
        case FIELD_ZERO:
          values[i] = 0;
          break;
        case FIELD_4BIT: {
          const combinedChar = this.readByte();
          values[i] = signExtend4Bit(combinedChar & 0x0f);
          i++;
          selector >>= 2;
          values[i] = signExtend4Bit(combinedChar >> 4);
          break;
        }
        case FIELD_8BIT:
          values[i] = signExtend8Bit(this.readByte());
          break;
        case FIELD_16BIT: {
          const char1 = this.readByte();
          const char2 = this.readByte();
          values[i] = signExtend16Bit(char1 | (char2 << 8));
          break;
        }
      }
      selector >>= 2;
    }
  }

  private readTag8_4S16_v2(values: number[]): void {
    const FIELD_ZERO = 0;
    const FIELD_4BIT = 1;
    const FIELD_8BIT = 2;
    const FIELD_16BIT = 3;
    let selector = this.readByte();
    let nibbleIndex = 0;
    let buffer = 0;
    for (let i = 0; i < 4; i++) {
      switch (selector & 0x03) {
        case FIELD_ZERO:
          values[i] = 0;
          break;
        case FIELD_4BIT:
          if (nibbleIndex === 0) {
            buffer = this.readByte();
            values[i] = signExtend4Bit(buffer >> 4);
            nibbleIndex = 1;
          } else {
            values[i] = signExtend4Bit(buffer & 0x0f);
            nibbleIndex = 0;
          }
          break;
        case FIELD_8BIT:
          if (nibbleIndex === 0) {
            values[i] = signExtend8Bit(this.readByte());
          } else {
            let char1 = (buffer & 0x0f) << 4;
            buffer = this.readByte();
            char1 |= buffer >> 4;
            values[i] = signExtend8Bit(char1);
          }
          break;
        case FIELD_16BIT:
          if (nibbleIndex === 0) {
            const char1 = this.readByte();
            const char2 = this.readByte();
            values[i] = signExtend16Bit((char1 << 8) | char2);
          } else {
            const char1 = this.readByte();
            const char2 = this.readByte();
            values[i] = signExtend16Bit(((buffer & 0x0f) << 12) | (char1 << 4) | (char2 >> 4));
            buffer = char2;
          }
          break;
      }
      selector >>= 2;
    }
  }

  /**
   * Read up to `valueCount` fields in TAG8_8SVB encoding (an 8-bit presence
   * bitmap followed by signed variable-byte values).
   */
  readTag8_8SVB(values: number[], valueCount: number): void {
    if (valueCount === 1) {
      values[0] = this.readSignedVB();
      return;
    }
    let header = this.readByte();
    for (let i = 0; i < 8; i++, header >>= 1) {
      values[i] = header & 0x01 ? this.readSignedVB() : 0;
    }
  }
}
