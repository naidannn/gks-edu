-- 1N-06 — the stage graph is data, and this row of it was an open door.
--
-- `buildCaseFlowDefinitions` used to emit a resume edge from `ON_HOLD` to every
-- stage of the service, staff-triggerable. So a consultant could park a case at
-- `CONTRACT_DRAFT` and resume it at `PREPAYMENT_PAID` or `BALANCE_PAID` — no
-- contract, no money — which is exactly the invariant the rest of the flow
-- relies on ("a case past PREPAYMENT_PAID has a confirmed prepayment behind
-- it"). The builder no longer emits them.
--
-- The seed prunes these too, but it only runs by hand and it also creates
-- placeholder intake rounds, which is not something to do to a database the
-- office works in. So the removal travels with the deploy instead.
DELETE FROM "case_flow_definitions"
WHERE "fromStage" = 'ON_HOLD'
  AND "toStage" IN ('CONTRACT_SIGNED', 'PREPAYMENT_PAID', 'BALANCE_PAID', 'COMPLETED');
