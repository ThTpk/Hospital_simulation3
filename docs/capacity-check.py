# -*- coding: utf-8 -*-
# Capacity vs demand for the v2 hospital — the sizing work behind docs/SPEC.md section 6.
#   python docs/capacity-check.py
#
# This script is the authority for the numbers in the spec, not the other way round (criterion 14). It reads the same
# volumes, the same clinic mix and the same order-set rates as sim/shared/model.js, so if the two drift apart the
# model's own test suite catches it: tests/flow.test.js prints the order rate this script predicts.
#
# Two sizing policies, because a counter and a doctor do not cost the same:
#   peak  : size so the busy hour runs at rho <= 0.85 — cheap slots, and a queue there is pure waste
#   daily : size on the whole day's workload at 50-85% — doctors are too expensive to staff for the peak, so a
#           morning queue is accepted and attacked by spreading appointments instead. Small units (dental,
#           physiotherapy) land low in this band simply because you cannot buy half a chair.
#   standby: deliberately left slack. A theatre that is busy 80% of the day has no room for the trauma case that
#           walks in at 16:00, so the operating theatres are sized for availability, not for utilisation.
import sys, math
sys.stdout.reconfigure(encoding='utf-8')

# ---- arrivals per day, by lane (model.js: LANES)
ARR = dict(walkin=260, appt=180, checkup=40, dental=35, physio=30, vacc=25, er=75, elective=10)
opd = ARR['walkin'] + ARR['appt']
er = ARR['er']

# ---- the consultation clinics (model.js: CLINICS) and their order sets (model.js: ORDER_RULES)
CLINICS = {
    #        share  rooms  svc   lab   xray   ekg    ct
    'med':   (0.32,  6,    10,   0.52, 0.10, 0.12, 0.02),
    'surg':  (0.14,  3,     9,   0.38, 0.26, 0.04, 0.09),
    'ped':   (0.15,  3,     8,   0.26, 0.12, 0.01, 0.01),
    'obg':   (0.11,  2,    10,   0.42, 0.02, 0.02, 0.06),
    'ortho': (0.12,  2,     8,   0.10, 0.74, 0.00, 0.08),
    'eye':   (0.09,  2,     7,   0.08, 0.01, 0.00, 0.01),
    'ent':   (0.07,  1,     7,   0.14, 0.10, 0.00, 0.04),
}
# the chance a patient leaves the consultation with at least one test, weighted by the clinic mix.
# A flat 34/14/5/3 would give 47.7%; per clinic it comes out higher, because the busiest clinics order the most.
P_ANY = sum(s * (1 - (1 - l) * (1 - x) * (1 - e) * (1 - c)) for (s, _r, _v, l, x, e, c) in CLINICS.values())
P_LAB = sum(s * l for (s, _r, _v, l, _x, _e, _c) in CLINICS.values())
P_XRY = sum(s * x for (s, _r, _v, _l, x, _e, _c) in CLINICS.values())
P_EKG = sum(s * e for (s, _r, _v, _l, _x, e, _c) in CLINICS.values())
P_CT = sum(s * c for (s, _r, _v, _l, _x, _e, c) in CLINICS.values())
DOC_SVC = sum(s * v for (s, _r, v, _l, _x, _e, _c) in CLINICS.values())

# ---- the rest of the rules (model.js: RULES)
P_PROC, P_ADMIT, P_RX = 0.10, 0.05, 0.83
ER_LAB, ER_XRY, ER_EKG, ER_CT = 0.62, 0.45, 0.25, 0.14
ER_OR, ER_ADMIT = 0.11, 0.28
ER_ICU, OPD_ICU = 0.10, 0.04  # the share of admissions that need intensive care

# ---- visits per unit per day
visits = {
    'INFO': opd * 0.35 + ARR['checkup'] + ARR['dental'] + ARR['physio'] + ARR['vacc'],
    'REG': opd + ARR['checkup'] + ARR['dental'] + ARR['physio'] + ARR['vacc'] + ARR['elective'],
    'TRI': opd + ARR['checkup'] + ARR['vacc'],
    'DOC': opd * (1 + P_ANY) + ARR['checkup'] + ARR['physio'],
    'PRC': opd * P_PROC + ARR['vacc'],
    'DEN': ARR['dental'],
    'PT': ARR['physio'],
    'LAB': opd * P_LAB + ARR['checkup'] + er * ER_LAB + ARR['elective'],
    'XRY': opd * P_XRY + ARR['checkup'] + er * ER_XRY,
    'EKG': opd * P_EKG + ARR['checkup'] + er * ER_EKG,
    'CT': opd * P_CT + er * ER_CT,
    'PHA': opd * P_RX + er * 0.60 + ARR['dental'] * 0.8 + ARR['elective'],
    'CSH': opd + ARR['checkup'] + ARR['dental'] + ARR['physio'] + ARR['vacc'] + er * 0.7 + ARR['elective'],
    'ERT': er,
    'ER': er * (1 + (1 - (1 - ER_LAB) * (1 - ER_XRY) * (1 - ER_CT))),  # reassessed after the work-up
    'ANE': ARR['elective'] + er * ER_OR,
    'OR': er * ER_OR + ARR['elective'],
    'PACU': er * ER_OR + ARR['elective'],
    'ADM': opd * P_ADMIT + er * ER_ADMIT + ARR['elective'] * 0.4,
    'ICU': (er * ER_ADMIT + er * ER_OR) * ER_ICU + opd * P_ADMIT * OPD_ICU,
    'WARD': opd * P_ADMIT * (1 - OPD_ICU) + er * (ER_ADMIT + ER_OR) * (1 - ER_ICU) + ARR['elective'] * 0.4,
}

# svc minutes, slots, minutes open, peak multiplier (peak-hour load / average hour), policy
ST = {
    'INFO': (1.0, 2, 540, 2.0, 'peak'),
    'REG': (3.0, 8, 480, 1.8, 'peak'),
    'TRI': (4.0, 9, 480, 1.8, 'peak'),
    'DOC': (DOC_SVC, 19, 420, 1.6, 'daily'),
    'PRC': (8.0, 3, 480, 1.4, 'peak'),
    'DEN': (30.0, 3, 480, 1.2, 'daily'),
    'PT': (40.0, 4, 480, 1.2, 'daily'),
    'LAB': (5.0, 6, 480, 1.9, 'peak'),
    'XRY': (8.0, 5, 480, 1.5, 'peak'),
    'EKG': (10.0, 3, 480, 1.4, 'peak'),
    'CT': (20.0, 2, 480, 1.3, 'peak'),
    'PHA': (5.0, 8, 540, 1.5, 'peak'),
    'CSH': (2.5, 6, 540, 1.7, 'peak'),
    'ERT': (4.0, 2, 1440, 1.6, 'peak'),
    'ER': (30.0, 8, 1440, 1.5, 'peak'),
    'ANE': (20.0, 2, 480, 1.2, 'peak'),
    'OR': (95.0, 6, 600, 1.2, 'standby'),
    'PACU': (60.0, 6, 600, 1.2, 'peak'),
    'ADM': (15.0, 3, 540, 1.5, 'peak'),
    'ICU': (4320.0, 14, 1440, 1.0, 'daily'),
    'WARD': (4320.0, 200, 1440, 1.0, 'daily'),
}


def erlang(lam, mu, c):
    """Erlang-C: the mean wait in an M/M/c queue, and the offered load per slot."""
    a = lam / mu
    if a >= c:
        return None, a / c
    s = 0.0
    term = 1.0
    for n in range(c):
        if n:
            term *= a / n
        s += term
    pc = (term * (a / c) * c) / (c - a)
    p0 = 1 / (s + pc)
    cprob = pc * p0
    return cprob / (c * mu - lam), a / c


print(f"order set drawn at the consultation, weighted by the clinic mix:")
print(f"  lab {P_LAB*100:.1f}%  x-ray {P_XRY*100:.1f}%  ekg {P_EKG*100:.1f}%  ct {P_CT*100:.1f}%")
print(f"  at least one test: {P_ANY*100:.1f}%  ->  {1+P_ANY:.2f} consultations per outpatient")
print(f"  mean consultation {DOC_SVC:.2f} min\n")

print(f"{'unit':6}{'/day':>7}{'svc':>7}{'c':>4}{'policy':>8}{'util':>7}{'peak ρ':>8}{'Wq peak':>9}")
flags = []
for k, (svc, c, win, pk, pol) in ST.items():
    v = visits[k]
    util = v * svc / (c * win)
    wq, rho = erlang((v / win) * pk, 1 / svc, c)
    w = 'saturated' if wq is None else f"{wq:.1f}"
    print(f"{k:6}{v:7.0f}{svc:7.1f}{c:4d}{pol:>8}{util:7.2f}{rho:8.2f}{w:>9}")
    if pol == 'peak' and (wq is None or rho > 0.86):
        flags.append(f"{k}: sized on the peak but peak rho is {rho:.2f} — add a slot")
    if pol == 'daily' and not 0.50 <= util <= 0.86:
        flags.append(f"{k}: sized on the day but all-day utilisation is {util:.2f}")
    if pol == 'standby' and not 0.30 <= util <= 0.70:
        flags.append(f"{k}: kept on standby but all-day utilisation is {util:.2f}")

print()
print(f"beds: {visits['WARD']:.0f} admissions/day x 3 days = {visits['WARD']*3:.0f} bed-days")
print(f"      200 ward beds -> {visits['WARD']*3/200:.2f} occupancy; 14 ICU beds at 3 days -> {visits['ICU']*3/14:.2f}")
print(f"consultation workload: {visits['DOC']:.0f} visits x {DOC_SVC:.1f} min = {visits['DOC']*DOC_SVC:.0f} min/day")
print(f"      = {visits['DOC']*DOC_SVC/420:.1f} rooms needed; the plan has 19 ({visits['DOC']*DOC_SVC/(19*420):.2f} utilisation)")
print(f"      the peak hour needs {(visits['DOC']/420)*1.6*DOC_SVC:.1f} rooms to stay under rho 1.0 — hence the")
print(f"      morning queue, which is attacked by spreading appointments, not by building 28 consulting rooms.")

if flags:
    print('\nsizing warnings:')
    for f in flags:
        print(' ', f)
else:
    print('\nevery unit meets its sizing policy.')
