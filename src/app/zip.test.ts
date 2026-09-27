import { describe, expect, it } from 'vitest'
import { crc32, zipOf } from './zip'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('a stored zip', () => {
  it('reproduces the CRC-32 check value: "123456789" is cbf43926', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(crc32(bytes(''))).toBe(0)
  })

  it('holds one file as it is, found by its directory', () => {
    const zip = zipOf([{ name: 'a.txt', data: bytes('hello') }], new Date(2026, 8, 27, 14, 30, 10))
    const view = new DataView(zip.buffer)
    // local header 30 + name 5 + data 5, directory 46 + name 5, end record 22
    expect(zip.length).toBe(113)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint16(8, true)).toBe(0)
    expect(view.getUint32(14, true)).toBe(0x3610a686)
    expect(view.getUint32(18, true)).toBe(5)
    expect(new TextDecoder().decode(zip.slice(30, 35))).toBe('a.txt')
    expect(new TextDecoder().decode(zip.slice(35, 40))).toBe('hello')
    // 2026-09-27 14:30:10 as MS-DOS words
    expect(view.getUint16(10, true)).toBe((14 << 11) | (30 << 5) | 5)
    expect(view.getUint16(12, true)).toBe((46 << 9) | (9 << 5) | 27)
    expect(view.getUint32(40, true)).toBe(0x02014b50)
    expect(view.getUint32(40 + 16, true)).toBe(0x3610a686)
    expect(view.getUint32(40 + 42, true)).toBe(0)
    expect(view.getUint32(91, true)).toBe(0x06054b50)
    expect(view.getUint16(91 + 10, true)).toBe(1)
    expect(view.getUint32(91 + 12, true)).toBe(51)
    expect(view.getUint32(91 + 16, true)).toBe(40)
  })
})
