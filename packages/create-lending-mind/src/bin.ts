#!/usr/bin/env node
import { initializeLendingMind } from "./index.js";

initializeLendingMind()
  .then((path) => console.log(`Initialized ${path}`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
