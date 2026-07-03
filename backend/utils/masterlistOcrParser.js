const PROGRAMS = [
  "BS Computer Science",
  "BS Information Technology",
  "BS Information Systems",
  "BS Entertainment and Multimedia Computing",
  "BS Business Administration",
  "BS Accountancy",
  "BS Civil Engineering",
  "BS Psychology",
  "BS Electrical Engineering",
  "BS Nursing",
  "BS Mechanical Engineering",
  "BSEd Major in English",
  "BS Marketing Management",
  "BS Biology",
  "BSCS",
  "BSIT",
  "BSIS",
  "BSEMC",
  "BSBA",
  "BSA",
  "BSED",
  "BEED",
  "STEM",
  "ABM",
  "HUMSS",
  "GAS",
  "ICT",
  "HE",
  "SMAW"
];
const DEPARTMENTS = [
  "Computer Science",
  "Business Administration",
  "Information Technology",
  "Accountancy",
  "Civil Engineering",
  "Psychology",
  "Electrical Engineering",
  "Nursing",
  "Mechanical Engineering",
  "Education",
  "Marketing Management",
  "Biology",
  "TVL Track",
  "Academic Track",
  "CCS",
  "CBA",
  "CTE",
  "CAS"
];
const COLLEGE_YEARS = ["1st year", "2nd year", "3rd year", "4th year"];
const SHS_YEARS = ["Grade 11", "Grade 12"];
const SECTIONS = ["A", "B", "C", "D"];
const ACADEMIC_LEVEL_TOKENS = ["Undergraduate", "College", "Senior High School", "SHS"];
const LAST_NAME_PREFIXES = new Set(["de", "del", "dela", "de la", "delos", "de los", "san", "santa"]);

function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStudentNumber(value = "") {
  return normalizeWhitespace(value).replace(/\s+/g, "-");
}

function findProgram(line) {
  const upper = line.toUpperCase();
  return PROGRAMS
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(program => new RegExp(`\\b${escapeRegExp(program).replace(/\s+/g, "\\s+")}\\b`, "i").test(upper)) || "";
}

function findYearLevel(line) {
  const gradeMatch = line.match(/\bgrade\s*(11|12)\b/i);
  if (gradeMatch) {
    return `Grade ${gradeMatch[1]}`;
  }

  const collegeMatch = line.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)?\b/i);
  if (collegeMatch) {
    const index = Number(collegeMatch[1]) - 1;
    return COLLEGE_YEARS[index] || "";
  }

  return "";
}

function inferYearLevelFromSection(section) {
  const match = String(section || "").match(/-(\d{1,2})[A-Z]$/i);
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  return COLLEGE_YEARS[year - 1] || "";
}

function findSection(line) {
  const sectionMatch = line.match(/\b(?:section|sec\.?)\s*([A-Z0-9-]+)\b/i);
  if (sectionMatch) {
    return sectionMatch[1].toUpperCase();
  }

  const codedMatch = line.match(/\b([A-Z]{2,6}\s*-\s*\d{1,2}\s*[A-Z])\b/i);
  if (codedMatch) {
    return codedMatch[1].replace(/\s+/g, "").toUpperCase();
  }

  const simpleMatch = line.match(/\b([A-D])\b(?!.*\b[A-D]\b)/i);
  return simpleMatch ? simpleMatch[1].toUpperCase() : "";
}

function findAcademicLevel(line, program, yearLevel) {
  if (/\b(undergraduate|college)\b/i.test(line)) {
    return "college";
  }

  if (/\b(senior high school|shs)\b/i.test(line)) {
    return "shs";
  }

  return inferAcademicLevel(program, yearLevel);
}

function findDepartment(line, academicLevel, program) {
  const detected = DEPARTMENTS
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(department => new RegExp(`\\b${escapeRegExp(department).replace(/\s+/g, "\\s+")}\\b`, "i").test(line));

  if (detected) {
    return detected;
  }

  return inferDepartment(academicLevel, program);
}

function inferAcademicLevel(program, yearLevel) {
  if (SHS_YEARS.includes(yearLevel) || ["STEM", "ABM", "HUMSS", "GAS", "ICT", "HE", "SMAW"].includes(program)) {
    return "shs";
  }

  if (COLLEGE_YEARS.includes(yearLevel) || ["BSCS", "BSIT", "BSIS", "BSEMC", "BSBA", "BSA", "BSED", "BEED"].includes(program)) {
    return "college";
  }

  return "";
}

function inferDepartment(academicLevel, program) {
  if (academicLevel === "shs") {
    return ["ICT", "HE", "SMAW"].includes(program) ? "TVL Track" : "Academic Track";
  }

  if (["BSCS", "BSIT", "BSIS", "BSEMC"].includes(program)) return "CCS";
  if (["BSBA", "BSA"].includes(program)) return "CBA";
  if (["BSED", "BEED"].includes(program)) return "CTE";
  return academicLevel === "college" ? "CAS" : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeKnownAcademicTokens(value, program, yearLevel, section) {
  let text = ` ${value} `;
  [
    program,
    yearLevel,
    section,
    ...PROGRAMS,
    ...DEPARTMENTS,
    ...ACADEMIC_LEVEL_TOKENS
  ].filter(Boolean).forEach(token => {
    const escaped = escapeRegExp(token).replace(/\s+/g, "\\s+");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
  });
  text = text.replace(/\b(section|sec\.?|grade|year|yr|undergraduate|college|senior high school|shs)\b/ig, " ");
  text = text.replace(/\b[A-Z]{2,6}\s*-\s*\d{1,2}\s*[A-Z]\b/ig, " ");
  text = text.replace(/\b[1-4](st|nd|rd|th)?\b/ig, " ");
  return normalizeWhitespace(text);
}

function firstTokenIndex(value, tokens = []) {
  const foundIndexes = tokens
    .filter(Boolean)
    .map(token => {
      const match = value.match(new RegExp(`\\b${escapeRegExp(token).replace(/\s+/g, "\\s+")}\\b`, "i"));
      return match ? match.index : -1;
    })
    .filter(index => index >= 0);

  return foundIndexes.length ? Math.min(...foundIndexes) : -1;
}

function textBeforeAcademicColumns(value, program, yearLevel, section) {
  const academicColumnIndex = firstTokenIndex(value, [
    program,
    yearLevel,
    section,
    ...PROGRAMS,
    ...DEPARTMENTS,
    ...ACADEMIC_LEVEL_TOKENS
  ]);

  return academicColumnIndex >= 0 ? value.slice(0, academicColumnIndex) : value;
}

function removeEmailFragments(value) {
  const tokens = normalizeWhitespace(value)
    .split(" ")
    .filter(Boolean);
  const emailTokenIndex = tokens.findIndex(token => /@|\.com\b|\.edu\b|example\b|gmail\b|yahoo\b/i.test(token));

  if (emailTokenIndex < 0) {
    const repeatedFirstNameIndex = tokens.findIndex((token, index) => {
      return index > 1 && token.replace(/[^a-z]/ig, "").toLowerCase() === tokens[0]?.replace(/[^a-z]/ig, "").toLowerCase();
    });
    if (repeatedFirstNameIndex > 0) {
      return tokens.slice(0, repeatedFirstNameIndex).join(" ");
    }

    return tokens.join(" ");
  }

  let cutIndex = emailTokenIndex;
  if (cutIndex > 0 && /^[a-z][a-z.\-_]*$/i.test(tokens[cutIndex - 1])) {
    const firstName = tokens[0]?.toLowerCase();
    const previous = tokens[cutIndex - 1].replace(/[^a-z]/ig, "").toLowerCase();
    if (previous === firstName || tokens[cutIndex - 1].includes(".")) {
      cutIndex -= 1;
    }
  }

  return tokens.slice(0, cutIndex).join(" ");
}

function findEmailMatches(line) {
  return [...String(line || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)]
    .map(match => ({ value: match[0], index: match.index || 0 }));
}

function findPhoneMatch(line) {
  const match = String(line || "").match(/\b(?:\+?63|0)?9\d{2}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  return match
    ? { value: normalizeWhitespace(match[0]).replace(/[\s.-]/g, ""), index: match.index || 0 }
    : null;
}

function parseParentSegment(line, afterStudentNumber, emailMatches, studentEmail, phoneMatch, program, yearLevel, section) {
  const parentEmail = (emailMatches.find(match => match.value !== studentEmail) || {}).value || "";
  const markerMatch = line.match(/\b(parent|guardian|mother|father|contact person|emergency contact)\b[:\s-]*/i);
  let segment = "";

  if (markerMatch) {
    segment = line.slice((markerMatch.index || 0) + markerMatch[0].length);
  } else if (phoneMatch) {
    const prefix = line.slice(0, phoneMatch.index);
    const academicIndex = firstTokenIndex(prefix, [
      program,
      yearLevel,
      section,
      ...PROGRAMS,
      ...DEPARTMENTS,
      ...ACADEMIC_LEVEL_TOKENS
    ]);
    segment = academicIndex >= 0 ? prefix.slice(academicIndex) : prefix;
  } else if (parentEmail) {
    segment = line.slice(0, line.indexOf(parentEmail));
  }

  if (!segment) {
    return {
      parentFirstName: "",
      parentMiddleName: "",
      parentLastName: "",
      parentEmail,
      parentPhoneNumber: phoneMatch?.value || "",
      parentRelationship: ""
    };
  }

  [
    studentEmail,
    parentEmail,
    phoneMatch?.value,
    phoneMatch?.value?.replace(/^\+63/, "0")
  ].filter(Boolean).forEach(token => {
    segment = segment.replace(new RegExp(escapeRegExp(token), "ig"), " ");
  });

  segment = removeKnownAcademicTokens(segment, program, yearLevel, section)
    .replace(/\b(parent|guardian|mother|father|contact person|emergency contact|phone|mobile|contact|email)\b/ig, " ");

  const relationshipMatch = line.match(/\b(mother|father|guardian)\b/i);
  const parsedName = parseName(segment);

  return {
    parentFirstName: toTitleCase(parsedName.firstName),
    parentMiddleName: toTitleCase(parsedName.middleName),
    parentLastName: toTitleCase(parsedName.lastName),
    parentEmail,
    parentPhoneNumber: phoneMatch?.value || "",
    parentRelationship: relationshipMatch ? toTitleCase(relationshipMatch[1]) : "Parent/Guardian"
  };
}

function toTitleCase(value) {
  return normalizeWhitespace(value).replace(/\b([A-Za-z])([A-Za-z']*)\b/g, (_, first, rest) => {
    return first.toUpperCase() + rest.toLowerCase();
  });
}

function splitLastNameParts(parts) {
  if (parts.length < 2) {
    return { middleParts: [], lastParts: [] };
  }

  const lowerParts = parts.map(part => part.toLowerCase());
  for (let size = Math.min(3, parts.length - 1); size >= 1; size -= 1) {
    const prefix = lowerParts.slice(parts.length - size - 1, parts.length - 1).join(" ");
    if (LAST_NAME_PREFIXES.has(prefix)) {
      return {
        middleParts: parts.slice(1, parts.length - size - 1),
        lastParts: parts.slice(parts.length - size - 1)
      };
    }
  }

  return {
    middleParts: parts.length > 2 ? parts.slice(1, -1) : [],
    lastParts: parts.slice(-1)
  };
}

function parseName(nameText) {
  const cleaned = normalizeWhitespace(nameText)
    .replace(/^[,.\-:;|]+|[,.\-:;|]+$/g, "")
    .replace(/\b(email|student|number|name|program|section|strand|course)\b/ig, "")
    .trim();

  if (!cleaned) {
    return { firstName: "", middleName: "", lastName: "" };
  }

  if (cleaned.includes(",")) {
    const [last, rest] = cleaned.split(",", 2).map(normalizeWhitespace);
    const parts = rest.split(" ").filter(Boolean);
    return {
      firstName: parts[0] || "",
      middleName: parts.slice(1).join(" "),
      lastName: last || ""
    };
  }

  const parts = cleaned.split(" ").filter(Boolean);
  const { middleParts, lastParts } = splitLastNameParts(parts);
  return {
    firstName: parts[0] || "",
    middleName: middleParts.join(" "),
    lastName: lastParts.join(" ")
  };
}

function parseMasterlistText(rawText = "") {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(line => normalizeWhitespace(line.replace(/[|]+/g, " ")))
    .filter(line => line.length >= 6);

  return lines.map((line, index) => {
    const studentNumberMatch = line.match(/\b\d{2,4}[- ]?\d{3,8}\b/);
    if (!studentNumberMatch) {
      return null;
    }

    const studentNumber = normalizeStudentNumber(studentNumberMatch[0]);
    const program = findProgram(line);
    const section = findSection(line);
    const yearLevel = findYearLevel(line) || inferYearLevelFromSection(section);
    const academicLevel = findAcademicLevel(line, program, yearLevel);
    const department = findDepartment(line, academicLevel, program);
    const emailMatches = findEmailMatches(line);
    const emailMatch = emailMatches[0] || null;
    const phoneMatch = findPhoneMatch(line);
    const afterStudentNumber = line.slice(studentNumberMatch.index + studentNumberMatch[0].length);
    const beforeAcademicColumns = textBeforeAcademicColumns(afterStudentNumber, program, yearLevel, section);
    const beforeEmail = emailMatch
      ? afterStudentNumber.slice(0, Math.max(0, afterStudentNumber.indexOf(emailMatch.value)))
      : beforeAcademicColumns;
    const nameText = removeEmailFragments(removeKnownAcademicTokens(beforeEmail, program, yearLevel, section))
      .replace(emailMatch?.value || "", "");
    const parsedName = parseName(nameText);
    const firstName = toTitleCase(parsedName.firstName);
    const middleName = toTitleCase(parsedName.middleName);
    const lastName = toTitleCase(parsedName.lastName);
    const parent = parseParentSegment(line, afterStudentNumber, emailMatches, emailMatch?.value || "", phoneMatch, program, yearLevel, section);

    const issues = [];
    if (!studentNumber) issues.push("Missing student number");
    if (!firstName) issues.push("Missing first name");
    if (!lastName) issues.push("Missing last name");
    if (!academicLevel) issues.push("Academic level needs review");
    if (!program) issues.push("Course / strand needs review");
    if (!yearLevel) issues.push("Year / grade needs review");
    if (!section) issues.push("Section needs review");

    return {
      sourceLine: index + 1,
      rawText: line,
      studentNumber,
      firstName,
      middleName,
      lastName,
      email: emailMatch?.value || "",
      ...parent,
      academicLevel,
      department,
      program,
      yearLevel,
      section,
      username: "",
      password: "",
      status: "active",
      confidence: issues.length ? "needs_review" : "ready",
      issues
    };
  }).filter(Boolean);
}

module.exports = {
  parseMasterlistText
};
