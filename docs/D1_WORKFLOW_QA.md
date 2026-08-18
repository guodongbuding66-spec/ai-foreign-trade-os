# Workflow D1 QA

After Production deploy:

1. Create a Task, refresh, verify it persists.
2. Create an Automation, run it, refresh, verify automation state and created task persist.
3. Run Automatic Loading, refresh, verify the load plan remains in D1.
4. Verify `/api/db/status` counts for `opportunities`, `tasks`, `automations`, `automation_runs`, `load_plans`, `load_plan_items`, and `audit_logs`.
5. Verify logout then direct `/api/tasks` access returns 401.
