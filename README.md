# Code Mentor Studio

Description

Student projects often contain bugs, security vulnerabilities, and poor coding practices that are difficult for beginners to identify. Manual code review by faculty is time-consuming and cannot always provide detailed feedback. This project proposes an LLM-powered assistant that automatically analyzes student code, identifies security and quality issues, explains them in simple language, and suggests appropriate fixes.

i want to build this with attractive and interactive UI

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e381653d-1c56-416f-9e12-496181714c9b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## AI code review

Pressing **Review my code** sends the code to an LLM on the server (`src/lib/review.functions.ts`)
and shows the structured findings it returns. If no API key is set, or the call fails, the
built-in regex rules in `src/lib/code-review.ts` are used instead, and the UI says so.

Set these server-side environment variables (see `.env.example`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `LLM_API_KEY` or `LOVABLE_API_KEY` | API key. One of them is required for AI review | none |
| `LLM_API_URL` | Any OpenAI-compatible `/chat/completions` endpoint | Lovable AI gateway |
| `LLM_MODEL` | Model name | `google/gemini-2.5-flash` |

The key is only read on the server and never reaches the browser. Model replies are parsed and
validated (`src/lib/llm-review.ts`), so malformed output is dropped instead of breaking the UI.
Note that code is sent to the LLM provider when a review runs.
