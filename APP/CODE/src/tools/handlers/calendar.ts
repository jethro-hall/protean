import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';

/**
 * Read-only clinic calendar from a JSON fixture under datasets (Law 4).
 * Not a live EMR — Phase 5 registry wiring for the medical pack's calendarRead id.
 */

const appointmentSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  patientLabel: z.string(),
  reason: z.string(),
  clinician: z.string(),
  status: z.enum(['booked', 'arrived', 'cancelled', 'completed']),
});

const calendarFileSchema = z.object({
  clinicId: z.string(),
  timezone: z.string(),
  appointments: z.array(appointmentSchema),
});

export type ClinicAppointment = z.infer<typeof appointmentSchema>;

export interface CalendarListing {
  clinicId: string;
  timezone: string;
  appointments: ClinicAppointment[];
  sourceRelativePath: string;
}

function assertUnderRoot(datasetsRoot: string, relativePath: string): string {
  const root = resolve(datasetsRoot);
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.includes('..')) {
    throw new Error(`Calendar path may not contain "..": "${relativePath}"`);
  }
  const absolute = resolve(root, cleaned);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error(`Calendar path escapes datasets root: "${relativePath}"`);
  }
  return absolute;
}

const DEFAULT_CALENDAR_RELATIVE = 'medical/clinic-calendar.json';

/** List appointments from the medical calendar fixture. */
export function listAppointments(
  datasetsRoot: string,
  relativePath: string = DEFAULT_CALENDAR_RELATIVE,
  day?: string,
): CalendarListing {
  const absolute = assertUnderRoot(datasetsRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Calendar dataset not found: ${relativePath}`);
  }
  const parsed = calendarFileSchema.parse(JSON.parse(readFileSync(absolute, 'utf8')) as unknown);
  const appointments =
    day === undefined || day === ''
      ? parsed.appointments
      : parsed.appointments.filter((appt) => appt.startsAt.slice(0, 10) === day);
  return {
    clinicId: parsed.clinicId,
    timezone: parsed.timezone,
    appointments,
    sourceRelativePath: relativePath.replace(/\\/g, '/'),
  };
}
