import { z } from 'zod';

export const ConnectOptionsSchema = z.object({
  type: z.enum(['serial', 'tcp', 'udp']),
  port: z.string().optional(),
  baudRate: z.number().int().positive().max(921600).optional(),
  host: z.string().optional(),
  tcpPort: z.number().int().positive().max(65535).optional(),
  udpPort: z.number().int().positive().max(65535).optional(),
  udpMode: z.enum(['listen', 'client']).optional(),
  udpRemoteHost: z.string().optional(),
  udpRemotePort: z.number().int().positive().max(65535).optional(),
  udpClientLocalPort: z.number().int().positive().max(65535).optional(),
  protocol: z.enum(['mavlink', 'msp']).optional(),
}).strict();

export const MSPConnectOptionsSchema = z.object({
  port: z.string().min(1),
  baudRate: z.number().int().positive().max(921600).optional(),
}).strict();

export const SigningSetKeySchema = z.object({
  passphrase: z.string().min(8).max(256).regex(/^[a-zA-Z0-9._-]+$/),
}).strict();

export const FirmwareFlashSchema = z.object({
  firmwarePath: z.string().min(1),
  board: z.object({
    path: z.string(),
    manufacturer: z.string().optional(),
    vendorId: z.string().optional(),
    productId: z.string().optional(),
    friendlyName: z.string().optional(),
  }),
  options: z.object({
    eraseAll: z.boolean().optional(),
    verify: z.boolean().optional(),
    expectedHash: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  }).optional(),
}).strict();

export const ParamSetSchema = z.object({
  paramId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  value: z.number().finite(),
  type: z.number().int().min(0).max(255),
}).strict();

export const MissionItemSchema = z.object({
  seq: z.number().int().nonnegative(),
  frame: z.number().int().min(0).max(10),
  command: z.number().int().min(0).max(65535),
  current: z.number().int().min(0).max(1),
  autocontinue: z.number().int().min(0).max(1),
  param1: z.number().finite(),
  param2: z.number().finite(),
  param3: z.number().finite(),
  param4: z.number().finite(),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  mission_type: z.number().int().min(0).max(255).optional(),
}).strict();

export const MavlinkSendSchema = z.object({
  payload: z.array(z.number().int().min(0).max(255)).min(1).max(280),
}).strict();

export const ValidateIPC = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = result.error;
    // ZodError has issues in older versions - use format() or handle gracefully
    let msg = 'Invalid IPC payload';
    try {
      const formatted = error.format();
      // formatted is an object with _errors at each level
      const collectErrors = (obj: Record<string, unknown>, prefix = ''): string[] => {
        const errors: string[] = [];
        for (const [key, value] of Object.entries(obj)) {
          if (key === '_errors' && Array.isArray(value)) {
            errors.push(...value.map(e => `${prefix}${e}`));
          } else if (typeof value === 'object' && value !== null) {
            errors.push(...collectErrors(value as Record<string, unknown>, `${prefix}${key}.`));
          }
        }
        return errors;
      };
      const allErrors = collectErrors(formatted as Record<string, unknown>);
      if (allErrors.length > 0) {
        msg = `Invalid IPC payload: ${allErrors.join(', ')}`;
      }
    } catch {
      msg = 'Invalid IPC payload: validation failed';
    }
    throw new Error(msg);
  }
  return result.data;
};

export const sanitizePath = (input: string, allowedRoots: string[]): string => {
  const path = require('path');
  const normalized = path.normalize(input);
  const resolved = path.resolve(normalized);
  
  for (const root of allowedRoots) {
    if (resolved.startsWith(path.resolve(root))) {
      return resolved;
    }
  }
  
  throw new Error(`Path traversal attempt blocked: ${input}`);
};