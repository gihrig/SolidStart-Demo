# Examine project errors and warnings then propose corrections

# Context

- Apply standards and best practices for a SolidStart application using /solidjs-solidstart-expert when creating solutions
- The command `vp check` returns many errors and warnings

# Task

- Execute the command `vp check` and examine the errors and warnings
  - Address the first error or warning and perform the following:
  - Review the error/warning and associated source code
  - Formulate a solution
  - Present the solution for approval
  - If approved implement the solution
  - If not approved solicit feedback and refine the solution then present the new solution for approval
  - When a solution has been approved and implemented
    - If new functionality has been created, create or update tests as appropriate
    - Execute the test or tests applicable to the changed file or files
    - Correct any errors raised in testing and run tests until they pass
    - Create a git commit message appropriate to the changes in 'conventional commit' format
    - Present the commit message for review
  - When the commit message has been accepted commit the changes to the current git branch
- Repeat the process for the next error or warning until all have been corrected, tested and committed
