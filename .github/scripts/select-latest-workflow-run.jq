[
  .workflow_runs[]
  | select(.name == $name)
]
| sort_by([
    (.run_number // 0),
    (.run_attempt // 0),
    (.created_at // "")
  ])
| last // empty
