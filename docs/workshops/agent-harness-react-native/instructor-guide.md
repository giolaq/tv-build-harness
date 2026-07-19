# Instructor Guide

## Before the workshop

1. Send [setup](00-before-you-arrive.md) 48 hours early.
2. Ask each attendee to report one status: **live ready**, **replay ready**, or **blocked**.
3. Test every replay and checkpoint from a clean clone.
4. Rehearse the pinned ADBT version, Vega SDK 0.22, and target VDA image.
5. Keep the completed TV app hidden until the TV exercise ends.

## Four-hour schedule

| Time | Attendees do | If blocked |
| --- | --- | --- |
| 00:00 | Run setup and choose Pocket Cinema or their app | Use Pocket Cinema and replay |
| 00:15 | Run one agent call and list missing evidence | Show the Step 1 output |
| 00:40 | Trace a failed check into one retry | Read the retry recording together |
| 01:10 | Inspect phases, commits, cost, and resume state | Use the resume fixture |
| 01:45 | Trace skills, tools, executors, and recording | Use Step 4 replay |
| 02:15 | Review and apply a synthetic memory proposal | Use the copied fixture |
| 02:35 | Plan and run the guarded Pocket Cinema port | Use the audit checkpoint |
| 03:05 | Trace the remote focus flow and failure | Use the focus fixture |
| 03:25 | Plan and run the Vega handoff | Use the complete checkpoint |
| 03:50 | Draft a harness for another domain | Use the worksheet example |

Bee is optional. Run it only if setup, consent, and time allow.

## Teaching rule

State four things before each exercise:

1. What attendees will run.
2. What file or output they will inspect.
3. What proves the exercise is complete.
4. Which replay or checkpoint to use if blocked.

Do not let model, device, or account setup consume the workshop. Try one repair for no more than 10 minutes, then move to the fallback.

## What to measure

Track these separately:

- core harness lessons completed;
- guarded React Native port completed;
- TV behavior understood;
- live Vega run completed;
- fallback used;
- time and model cost;
- help requests.

The main learning outcome must not depend on a live model, Vega device, or Bee.
