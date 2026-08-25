#!/usr/bin/env python3
import os
import re

class LMPDocsGenerator:
    def __init__(self, src_file: str = "crates/lmp-core/src/ast.rs", output_md: str = "docs/ast-axioms.md"):
        self.src_file = os.path.abspath(src_file)
        self.output_md = os.path.abspath(output_md)
        os.makedirs(os.path.dirname(self.output_md), exist_ok=True)

    def extract_and_compile_docs(self) -> None:
        """Parses the Rust AST module for custom string violations and compiles a documentation grid."""
        print(f"📖 Scanning Rust core systems source tree: {self.src_file}")
        if not os.path.exists(self.src_file):
            print("⚠️ Source file not found. Generating a standard placeholder documentation file.")
            self._write_fallback_docs()
            return

        with open(self.src_file, "r") as f:
            content = f.read()

        # Regular expression to extract explicit validation errors inside the compiler visitor logic
        violation_patterns = re.findall(r'"([A-Z_]+_VIOLATION|[A-Z_]+_RISK):\s*([^"]+)"', content)

        markdown_output = [
            "# Lending-Mind Protocol (LMP) AST Enforcement Registry 🛡️\n",
            "This document is generated automatically by the core compiler source analysis tools. It profiles every structural code rule evaluated by the local validation daemon (`lmpd`).\n",
            "| Rule Code Class | Automated Evaluation Violation / Prevention Constraint Guard |",
            "| :--- | :--- |"
        ]

        for code, description in violation_patterns:
            markdown_output.append(f"| `{code}` | {description.strip()} |")

        with open(self.output_md, "w") as f:
            f.write("\n".join(markdown_output))
        
        print(f"✨ Static protocol documentation site asset generated successfully: {self.output_md}")

    def _write_fallback_docs(self) -> None:
        fallback_content = (
            "# Lending-Mind Protocol (LMP) AST Enforcement Registry 🛡️\n\n"
            "| Rule Code Class | Automated Evaluation Violation / Prevention Constraint Guard |\n"
            "| :--- | :--- |\n"
            "| `CRITICAL_AXIOM_VIOLATION` | Function names async execution but lacks the literal async keyword modifier. |\n"
            "| `THREAD_RACE_RISK` | Blocking routine invoked while thread holds an exclusive resource access lock. |\n"
        )
        with open(self.output_md, "w") as f:
            f.write(fallback_content)

if __name__ == "__main__":
    generator = LMPDocsGenerator()
    generator.extract_and_compile_docs()
