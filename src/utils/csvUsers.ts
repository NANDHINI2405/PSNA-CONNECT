import {
  BaseRole,
  Gender,
  HostelType,
  MasterRegistryEntry,
  ProgramLevel,
  deriveClassName,
  getDefaultBlockForHostel,
  getHostelTypeForGender,
  normalizeRegistryId,
} from '../types';

export interface CsvRowError {
  rowNumber: number;
  identifier: string;
  email: string;
  reason: string;
}

export interface CsvParseResult {
  rows: MasterRegistryEntry[];
  errors: CsvRowError[];
  totalDataRows: number;
}

export const SAMPLE_MASTER_CSV = [
  'register no/staff ID,name,email,department,year,gender,hostel Y/N,warden Y/N',
  '921324104081,Divya Bharathi S,divya.cse@psnacet.edu.in,Computer Science & Engineering,UG Year 2,Girl,Y,N',
  '921324106088,Arjun Prasad K,arjun.ece@psnacet.edu.in,Electronics & Communication,UG Year 3,Boy,N,N',
  '921325104015,Harini Priya M,harini.pgcse@psnacet.edu.in,Computer Science & Engineering,PG Year 1,Girl,Y,N',
  'PSNA-STF-021,Prof. Rajeshwari K,rajeshwari.it@psnacet.edu.in,Information Technology,Staff,Girl,N,N',
  'PSNA-WRD-005,Dr. Senthil Kumar M,senthil.warden@psnacet.edu.in,Mechanical Engineering,Staff,Boy,N,Y',
].join('\n');

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseBoolFlag(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(v)) return true;
  if (['n', 'no', 'false', '0', ''].includes(v)) return false;
  return null;
}

function parseGenderValue(raw: string): Gender | null {
  const v = raw.trim().toLowerCase();
  if (['girl', 'female', 'f', 'woman'].includes(v)) return 'Girl';
  if (['boy', 'male', 'm', 'man'].includes(v)) return 'Boy';
  return null;
}

function parseYearAndRole(
  rawYear: string,
  department: string,
  isHostel: boolean,
  isWarden: boolean,
  explicitRoleRaw?: string
): {
  role: BaseRole;
  yearLabel: string;
  programLevel?: ProgramLevel;
  academicYear?: string;
  className?: string;
  error?: string;
} {
  const cleanYear = rawYear.trim();
  const yLower = cleanYear.toLowerCase();
  const expLower = (explicitRoleRaw || '').trim().toLowerCase();

  if (isWarden) {
    if (expLower === 'management') {
      return {
        role: 'staff',
        yearLabel: 'Warden',
        error: 'Warden Y/N cannot be combined with Management role.',
      };
    }
    return {
      role: 'staff',
      yearLabel: cleanYear || 'Staff',
    };
  }

  if (expLower === 'management' || yLower === 'management' || yLower === 'admin') {
    if (isHostel) {
      return {
        role: 'management',
        yearLabel: 'Management',
        error: 'Management users cannot be marked as Hostel Residents.',
      };
    }
    return {
      role: 'management',
      yearLabel: 'Management',
    };
  }

  if (
    expLower === 'staff' ||
    expLower === 'faculty' ||
    yLower === 'staff' ||
    yLower === 'faculty' ||
    yLower === '-' ||
    yLower === 'na' ||
    yLower === 'n/a' ||
    (!cleanYear && !isHostel)
  ) {
    if (isHostel) {
      return {
        role: 'student',
        yearLabel: 'Year 1',
        error: 'Hostel residents must have an academic year (e.g. UG Year 1 or PG Year 1).',
      };
    }
    return {
      role: 'staff',
      yearLabel: 'Staff',
    };
  }

  const isPg =
    yLower.includes('pg') ||
    yLower.includes('me ') ||
    yLower.startsWith('me') ||
    yLower.includes('m.e') ||
    yLower.includes('mtech') ||
    yLower.includes('m.tech') ||
    yLower.includes('mca') ||
    yLower.includes('mba');

  let yrNum = '';
  if (/(^|\s|\b)(4|iv|4th|year\s*4)($|\s|\b)/i.test(cleanYear)) yrNum = 'Year 4';
  else if (/(^|\s|\b)(3|iii|3rd|year\s*3)($|\s|\b)/i.test(cleanYear)) yrNum = 'Year 3';
  else if (/(^|\s|\b)(2|ii|2nd|year\s*2)($|\s|\b)/i.test(cleanYear)) yrNum = 'Year 2';
  else if (/(^|\s|\b)(1|i|1st|year\s*1)($|\s|\b)/i.test(cleanYear)) yrNum = 'Year 1';

  if (!yrNum) {
    return {
      role: 'student',
      yearLabel: cleanYear,
      error: `Unrecognized year "${cleanYear}". Use UG Year 1..4, PG Year 1..2, Staff, or Management.`,
    };
  }

  if (isPg && (yrNum === 'Year 3' || yrNum === 'Year 4')) {
    return {
      role: 'student',
      yearLabel: cleanYear,
      error: `PG programs only support Year 1 or Year 2 (received "${cleanYear}").`,
    };
  }

  const programLevel: ProgramLevel = isPg ? 'PG' : 'UG';
  return {
    role: 'student',
    yearLabel: `${programLevel} ${yrNum}`,
    programLevel,
    academicYear: yrNum,
    className: deriveClassName(programLevel, department, yrNum).slice(0, 40),
  };
}

export function parseMasterUsersCsv(
  csvText: string,
  importedByUid?: string
): CsvParseResult {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], totalDataRows: 0 };
  }

  const rawHeaders = splitCsvLine(lines[0]).map(normalizeHeader);
  const findCol = (...candidates: string[]) =>
    rawHeaders.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const idIdx = findCol('registernostaffid', 'registerno', 'staffid', 'regno', 'rollnumber', 'rollno', 'id');
  const nameIdx = findCol('name', 'fullname', 'studentname');
  const emailIdx = findCol('email', 'collegeemail', 'mail');
  const deptIdx = findCol('department', 'dept', 'branch');
  const yearIdx = findCol('year', 'academicyear', 'programyear');
  const genderIdx = findCol('gender', 'sex');
  const hostelIdx = findCol('hostelyn', 'hostel', 'ishostel');
  const wardenIdx = findCol('wardenyn', 'warden', 'iswarden');
  const roleIdx = findCol('role');

  if (idIdx === -1 || nameIdx === -1 || emailIdx === -1 || deptIdx === -1 || genderIdx === -1) {
    return {
      rows: [],
      totalDataRows: Math.max(0, lines.length - 1),
      errors: [
        {
          rowNumber: 1,
          identifier: '-',
          email: '-',
          reason:
            'CSV header must include: register no/staff ID, name, email, department, year, gender, hostel Y/N, warden Y/N.',
        },
      ],
    };
  }

  const rows: MasterRegistryEntry[] = [];
  const errors: CsvRowError[] = [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const nowIso = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cols = splitCsvLine(lines[i]);
    const rawId = (cols[idIdx] || '').trim();
    const normalizedId = normalizeRegistryId(rawId);
    const name = (cols[nameIdx] || '').trim();
    const email = (cols[emailIdx] || '').trim().toLowerCase();
    const department = (cols[deptIdx] || '').trim();
    const rawYear = yearIdx >= 0 ? (cols[yearIdx] || '').trim() : '';
    const rawGender = (cols[genderIdx] || '').trim();
    const rawHostel = hostelIdx >= 0 ? (cols[hostelIdx] || '').trim() : 'N';
    const rawWarden = wardenIdx >= 0 ? (cols[wardenIdx] || '').trim() : 'N';
    const rawRole = roleIdx >= 0 ? (cols[roleIdx] || '').trim() : '';

    const rowErrors: string[] = [];

    if (!normalizedId || normalizedId.length < 3 || normalizedId.length > 32) {
      rowErrors.push('Invalid or missing Register No / Staff ID (3–32 alphanumeric/hyphen chars).');
    } else if (seenIds.has(normalizedId)) {
      rowErrors.push(`Duplicate Register No / Staff ID "${normalizedId}" in CSV.`);
    }

    if (!name || name.length > 100) {
      rowErrors.push('Name is required (max 100 chars).');
    }

    if (!email || email.length > 120 || !/^[^\s@]+@psnacet\.edu\.in$/i.test(email)) {
      rowErrors.push('Email must be a valid @psnacet.edu.in address.');
    } else if (seenEmails.has(email)) {
      rowErrors.push(`Duplicate email "${email}" in CSV.`);
    }

    if (!department || department.length > 80) {
      rowErrors.push('Department is required (max 80 chars).');
    }

    const gender = parseGenderValue(rawGender);
    if (!gender) {
      rowErrors.push(`Invalid gender "${rawGender || '(blank)'}". Use Boy or Girl.`);
    }

    const isHostel = parseBoolFlag(rawHostel);
    if (isHostel === null) {
      rowErrors.push(`Invalid Hostel Y/N value "${rawHostel}". Use Y or N.`);
    }

    const isWarden = parseBoolFlag(rawWarden);
    if (isWarden === null) {
      rowErrors.push(`Invalid Warden Y/N value "${rawWarden}". Use Y or N.`);
    }

    if (isHostel && isWarden) {
      rowErrors.push('A user cannot have both Hostel=Y and Warden=Y.');
    }

    const yearParsed = parseYearAndRole(
      rawYear,
      department || 'Computer Science & Engineering',
      Boolean(isHostel),
      Boolean(isWarden),
      rawRole
    );
    if (yearParsed.error) {
      rowErrors.push(yearParsed.error);
    }

    if (rowErrors.length > 0) {
      errors.push({
        rowNumber,
        identifier: rawId || normalizedId || '-',
        email: email || '-',
        reason: rowErrors.join(' '),
      });
      continue;
    }

    seenIds.add(normalizedId);
    seenEmails.add(email);

    const resolvedGender = gender!;
    const hostelFlag = Boolean(isHostel);
    const wardenFlag = Boolean(isWarden);
    const hostelType: HostelType | undefined =
      hostelFlag || wardenFlag ? getHostelTypeForGender(resolvedGender) : undefined;

    rows.push({
      id: normalizedId,
      registerOrStaffId: normalizedId,
      name: name.slice(0, 100),
      email,
      role: yearParsed.role,
      department: department.slice(0, 80),
      year: yearParsed.yearLabel.slice(0, 32),
      programLevel: yearParsed.programLevel,
      academicYear: yearParsed.academicYear,
      className: yearParsed.className,
      gender: resolvedGender,
      isHostel: hostelFlag,
      isWarden: wardenFlag,
      hostelType,
      active: true,
      importedAt: nowIso,
      importedByUid,
      ...(hostelFlag || wardenFlag ? { block: getDefaultBlockForHostel(hostelType!) } : {}),
    } as MasterRegistryEntry);
  }

  return {
    rows,
    errors,
    totalDataRows: Math.max(0, lines.length - 1),
  };
}
