#!/usr/bin/env python3
"""
Works out, by hand and without any byTeam code, what the demo month should look
like and what each demo employee should be paid. The Vitest fixtures are this
script's output, so a disagreement with the app is a bug in one of the two.

    python3 tests/fixtures/demo/generate.py

Story (see docs/DESIGN.md "Seed data"), March 2017, Friday and Saturday off,
shift 09:00 to 18:00 with 10 minutes of grace (09:10 is on time, 09:11 is late),
and the pay rules the office chose: a day of pay is gross divided by the working
days of the month, every 3 lates cost one day, unpaid leave is deducted like
absence. Money is worked in paisa with exact fractions. Each line is rounded half
up to the paisa and net pay is rounded half up to a whole taka once, at the end.
"""
import csv
import json
import math
import os
from datetime import date, timedelta
from fractions import Fraction as F

YEAR, MONTH = 2017, 3
OFF_WEEKDAYS = {4, 5}  # Python counts Monday as 0, so Friday is 4 and Saturday is 5
LATES_PER_DAY = 3
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "2017-03")


def half_up(x):
    return math.floor(x + F(1, 2))


month_days = [date(YEAR, MONTH, 1) + timedelta(days=i) for i in range(31)]
open_days = [d for d in month_days if d.weekday() not in OFF_WEEKDAYS]
holiday = open_days[7]  # the made-up holiday is the 8th day that is not a weekly off
W = [d for d in open_days if d != holiday]  # working days, the 21 that count
assert len(W) == 21 and holiday == date(2017, 3, 12)
first_friday = next(d for d in month_days if d.weekday() in OFF_WEEKDAYS and d != holiday)
iso = lambda d: d.isoformat()

employees = []


def person(key, name, gross, basic_pct, join=None, bonus="0", advance="0", story=""):
    employees.append(dict(key=key, name=name, gross=F(gross), basic_pct=basic_pct, join=join or date(2016, 1, 1),
                          bonus=F(bonus), advance=F(advance), story=story, cells={}, late_minutes={}, missing_out=[], off_day_work=[]))
    return employees[-1]


def base_cells(e):
    """Weekly off days and the holiday are what they are; working days start as present."""
    for d in month_days:
        if d < e["join"]:
            continue
        if d == holiday:
            e["cells"][d] = "holiday"
        elif d.weekday() in OFF_WEEKDAYS:
            e["cells"][d] = "weekly_off"
        else:
            e["cells"][d] = "present"


# 1. Always on time.
e = person("on_time", "Anwar Hossain", "30000", "50", bonus="2000", story="Arrives 08:50 and leaves 18:05 every working day. Gets a 2,000 bonus.")
base_cells(e)

# 2. Late often: six arrivals at 09:25 and one at 09:11 are late. 09:10 is exactly the grace limit, so on time.
e = person("frequent_late", "Farhana Akter", "24000", "60", story="Late on 6 days at 09:25 and 1 day at 09:11. One arrival at exactly 09:10 is on time.")
base_cells(e)
for i in (1, 2, 4, 5, 8, 9):
    e["cells"][W[i]] = "late"; e["late_minutes"][iso(W[i])] = 25
e["cells"][W[12]] = "late"; e["late_minutes"][iso(W[12])] = 11
# W[14] arrives 09:10: present.

# 3. Absent two days with no leave. Takes a 5,000 advance.
e = person("absent_no_leave", "Mahbub Alam", "28000", "50", advance="5000", story="Absent on 2 working days with no leave. Takes a 5,000 advance.")
base_cells(e)
for i in (3, 4):
    e["cells"][W[i]] = "absent"

# 4. Two days on approved paid leave.
e = person("absent_paid_leave", "Nasrin Sultana", "26000", "50", story="Two working days on approved paid leave.")
base_cells(e)
for i in (6, 7):
    e["cells"][W[i]] = "leave_paid"

# 5. Two days on approved unpaid leave.
e = person("absent_unpaid_leave", "Kamal Hasan", "32000", "50", story="Two working days on approved unpaid leave.")
base_cells(e)
for i in (10, 11):
    e["cells"][W[i]] = "leave_unpaid"

# 6. Forgot to punch out on three days: still present, flagged.
e = person("forgotten_punch_out", "Rubina Yasmin", "22000", "50", story="Arrival punch only on 3 working days.")
base_cells(e)
for i in (2, 9, 15):
    e["missing_out"].append(iso(W[i]))

# 7. Every punch is read twice a few seconds apart, and one weekly off day is worked.
e = person("double_tap", "Tanvir Ahmed", "40000", "50", story="Every punch read twice seconds apart. On one day only the arrival was read, twice, so there is no leaving punch. Came in on the first Friday, a weekly off day.")
base_cells(e)
e["off_day_work"].append(iso(first_friday))
e["missing_out"].append(iso(W[5]))  # only the arrival was read that day, twice: the second tap is not leaving

# 8. Joined mid-month on the 10th working day, late once after joining, 1,500 joining bonus.
join = W[9]
e = person("joined_mid_month", "Sabina Khatun", "36000", "50", join=join, bonus="1500", story="Joined on the 10th working day (15 March). Late once at 09:30. Gets a 1,500 bonus.")
base_cells(e)
e["cells"][W[11]] = "late"; e["late_minutes"][iso(W[11])] = 30

# ------------------------------------------------------------------ totals and pay
os.makedirs(OUT, exist_ok=True)
rows = []
for e in employees:
    counts = {s: sum(1 for v in e["cells"].values() if v == s) for s in ("present", "late", "absent", "leave_paid", "leave_unpaid", "weekly_off", "holiday")}
    totals = dict(
        present=counts["present"] + counts["late"],
        late=counts["late"],
        absent=counts["absent"],
        leave=counts["leave_paid"] + counts["leave_unpaid"],
        missingOut=len(e["missing_out"]),
        workedOffDays=len(e["off_day_work"]),
        lateMinutes=sum(e["late_minutes"].values()),
    )

    payable_days = (date(YEAR, MONTH, 31) - max(e["join"], date(YEAR, MONTH, 1))).days + 1
    gross_p = e["gross"] * 100
    gross_earned = half_up(gross_p * payable_days / 31)
    day_cost = lambda days: half_up(gross_p * days / len(W))
    absent_ded = day_cost(counts["absent"])
    unpaid_ded = day_cost(counts["leave_unpaid"])
    late_days = counts["late"] // LATES_PER_DAY
    late_ded = day_cost(late_days)
    advance = int(e["advance"] * 100)
    bonus = int(e["bonus"] * 100)
    deductions = absent_ded + unpaid_ded + late_ded + advance
    net_exact = gross_earned - deductions + bonus
    net = half_up(F(net_exact, 100)) * 100
    money = lambda p: f"{p // 100}.{p % 100:02d}"

    pay = dict(
        monthlyGross=money(int(gross_p)),
        payableDays=payable_days,
        absentDays=counts["absent"],
        lateCount=counts["late"],
        unpaidLeaveDays=counts["leave_unpaid"],
        lateDaysDeducted=late_days,
        grossEarned=money(gross_earned),
        absentDeduction=money(absent_ded),
        unpaidLeaveDeduction=money(unpaid_ded),
        lateDeduction=money(late_ded),
        advance=money(advance),
        bonus=money(bonus),
        deductions=money(deductions),
        additions=money(bonus),
        netBeforeRounding=money(net_exact),
        net=money(net),
    )
    fixture = dict(
        key=e["key"], name=e["name"], story=e["story"], month="2017-03", joinDate=iso(e["join"]),
        grid={iso(d): s for d, s in sorted(e["cells"].items())},
        lateMinutes=e["late_minutes"], missingOut=e["missing_out"], workedOnOffDay=e["off_day_work"],
        totals=totals, pay=pay,
    )
    with open(os.path.join(OUT, f"{e['key']}.json"), "w") as f:
        json.dump(fixture, f, indent=2); f.write("\n")
    rows.append([e["key"], e["name"], pay["monthlyGross"], payable_days, pay["absentDays"], pay["lateCount"], pay["unpaidLeaveDays"],
                 pay["grossEarned"], pay["deductions"], pay["additions"], pay["netBeforeRounding"], pay["net"]])

with open(os.path.join(OUT, "expected-pay.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["key", "name", "monthly_gross", "payable_days", "absent_days", "late_count", "unpaid_leave_days", "gross_earned", "deductions", "additions", "net_before_rounding", "net"])
    w.writerows(rows)

for r in rows:
    print(r)
