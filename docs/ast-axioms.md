# Lending-Mind Protocol (LMP) AST Enforcement Registry 🛡️

This document is generated automatically by the core compiler source analysis tools. It profiles every structural code rule evaluated by the local validation daemon (`lmpd`).

| Rule Code Class | Automated Evaluation Violation / Prevention Constraint Guard |
| :--- | :--- |
| `CRITICAL_AXIOM_VIOLATION` | Function '{}' names async execution but lacks the literal 'async' structural keyword modifier. |
| `THREAD_RACE_RISK` | Blocking routine `{}` invoked while thread holds an exclusive resource access lock! |