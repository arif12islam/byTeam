# Demo month fixtures

One JSON file per demo employee for March 2017, with the grid the attendance engine must produce and the pay the payroll engine must reach. `2017-03/expected-pay.csv` has the same pay figures as one table, the way a spreadsheet would show them.

They are written by `generate.py`, which works everything out by hand-style rules and exact fractions and shares no code with byTeam, so the tests compare two independent calculations. Run it again after changing the story in `src/lib/demo/scenarios.ts`:

    python3 tests/fixtures/demo/generate.py

The rules used: Friday and Saturday off, shift 09:00 to 18:00 with 10 minutes of grace, a day of pay is gross divided by the working days of the month, every 3 lates cost one day, unpaid leave is deducted like absence, each money line is rounded half up to the paisa, and net pay is rounded half up to a whole taka once at the end.

A mismatch means a bug in the app, a bug here, or a rule nobody has decided.
