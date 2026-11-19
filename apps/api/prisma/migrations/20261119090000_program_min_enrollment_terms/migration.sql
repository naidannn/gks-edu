-- Language prep: how many terms a school makes a new student enrol and pay for
-- at once (2 = six months, 4 = a year). Null until staff or the importer set it.
ALTER TABLE "university_programs" ADD COLUMN "minEnrollmentTerms" INTEGER;
