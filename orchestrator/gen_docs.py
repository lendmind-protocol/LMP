#!/usr/bin/env python3
import os
import json

class LMPDocsGenerator:
    def __init__(self, registry_file: str = "registry/minds/lmp-protocol-core/rules/manifest.json", output_md: str = "docs/ast-axioms.md"):
        self.registry_file = os.path.abspath(registry_file)
        self.output_md = os.path.abspath(output_md)
        os.makedirs(os.path.dirname(self.output_md), exist_ok=True)

    def extract_and_compile_docs(self) -> None:
        """Compile documentation from the signed, structured rule registry."""
        print(f"📖 Reading structured enforcement registry: {self.registry_file}")
        if not os.path.exists(self.registry_file):
            raise FileNotFoundError(
                f"Rule registry required for generated documentation was not found: {self.registry_file}"
            )

        with open(self.registry_file, "r", encoding="utf-8") as f:
            registry = json.load(f)

        markdown_output = [
            "# Lending-Mind Protocol (LMP) Enforcement Registry 🛡️\n",
            "This document is generated from the structured Mind rule registry. It describes declared checks and their limits; it is not a claim that every declaration is implemented by every evaluator.\n",
            "| Rule | Severity | Assertion | Limitations |",
            "| :--- | :--- | :--- | :--- |",
        ]

        for rule in registry.get("rules", []):
            limitations = "; ".join(rule.get("limitations", []))
            markdown_output.append(
                f"| `{rule.get('id', 'unknown')}` | {rule.get('severity', 'unspecified')} | "
                f"{rule.get('assertion', 'No assertion supplied.')} | {limitations} |"
            )

        with open(self.output_md, "w") as f:
            f.write("\n".join(markdown_output))
        
        print(f"✨ Static protocol documentation site asset generated successfully: {self.output_md}")

if __name__ == "__main__":
    generator = LMPDocsGenerator()
    generator.extract_and_compile_docs()
