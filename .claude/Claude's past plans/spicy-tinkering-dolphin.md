# Welcome to the Team! 🎉

Hey! Welcome aboard. This guide will help you get started working on the CRE Deal Platform without breaking anything or stepping on anyone's toes.

---

## What Are We Building?

We're building a **Commercial Real Estate Deal Management Platform** - basically software that helps people manage real estate investment deals.

Think of it like this: when someone wants to invest in a big commercial property (like an office building or apartment complex), there's a TON of paperwork, money tracking, and communication that needs to happen. Our app handles all of that.

### The Three Parts of Our App

Our app is split into 3 separate services that talk to each other:

```
┌─────────────────────────────────────────────────────────────────┐
│                         THE BIG PICTURE                         │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │              │         │              │         │              │
    │   FRONTEND   │ ──────► │     BFF      │ ──────► │    KERNEL    │
    │   (React)    │         │   (Server)   │         │  (Core API)  │
    │              │         │              │         │              │
    └──────────────┘         └──────────────┘         └──────────────┘
        Port 5173               Port 8787               Port 3001

    What users see        Handles login,          The "brain" -
    and click on          permissions,            all the math and
                          talks to Kernel         deal logic lives here
```

### In Plain English:

| Part | What It Does | Folder | Language |
|------|--------------|--------|----------|
| **Frontend** | The website users see - buttons, forms, pages | `canonical-deal-os/src/` | JavaScript (React) |
| **BFF** | "Backend for Frontend" - handles logins, permissions, connects everything | `canonical-deal-os/server/` | JavaScript |
| **Kernel** | The core brain - calculates deals, projections, stores important data | `cre-kernel-phase1/` | TypeScript |

---

## Your Territory: The Kernel 🏠

You'll be working in **`cre-kernel-phase1/`** - this is your safe zone.

### Why the Kernel?

1. **It's isolated** - You literally can't break the website even if you tried
2. **TypeScript helps you** - If you make a mistake, the computer will tell you before anything breaks
3. **It's smaller** - Easier to understand than the giant frontend
4. **Clear purpose** - Handles the business math and data

### What's Inside the Kernel?

```
cre-kernel-phase1/
├── apps/
│   └── kernel-api/
│       ├── src/
│       │   ├── index.ts      ← The main entry point (server starts here)
│       │   ├── config.ts     ← Settings (like which port to use)
│       │   ├── projection.ts ← Financial calculations
│       │   └── prisma.ts     ← Database connection
│       ├── test/             ← Unit tests go here
│       └── prisma/
│           └── schema.prisma ← Database structure
└── package.json              ← Dependencies
```

---

## Getting Started (One-Time Setup)

### Step 1: Clone the Repository

```bash
# Open your terminal and run:
git clone <ask-teammate-for-url>
cd Github
```

### Step 2: Install Dependencies

```bash
# Go to the Kernel folder
cd cre-kernel-phase1

# Install all the packages it needs
npm install
```

### Step 3: Make Sure It Works

```bash
# Start the Kernel server
npm run dev:api
```

You should see something like:
```
Kernel API running on port 3001
```

**Success!** You're ready to start coding.

### Step 4: Create Your Branch (IMPORTANT!)

Before you change ANYTHING, create your own branch:

```bash
# Go back to the main project folder
cd ..

# Create a branch with your name
git checkout -b yourname/my-first-task
```

Now you're working in your own safe space!

---

## Daily Workflow ☀️

Do this every day before you start working:

### Morning Routine (2 minutes)

```bash
# 1. Go to the project folder
cd Github

# 2. Get the latest code from everyone else
git fetch origin
git pull origin main

# 3. Switch to your branch (or create a new one)
git checkout yourname/my-task

# 4. Merge in any new changes from main
git merge main
```

### While You're Working

```bash
# Save your work often! After each small change:
git add .
git commit -m "What I just did in plain English"
```

**Good commit messages:**
- ✅ "Add error message when deal ID is missing"
- ✅ "Fix typo in projection calculation"
- ✅ "Add tests for calculateROI function"

**Bad commit messages:**
- ❌ "stuff"
- ❌ "fixed it"
- ❌ "changes"

### End of Day (Share Your Work)

```bash
# Push your branch to GitHub
git push origin yourname/my-task
```

Then go to GitHub and create a **Pull Request** so your teammate can review your code.

---

## The Golden Rules 🏆

### Rule 1: STAY IN YOUR LANE

```
✅ YOU CAN WORK IN:
   cre-kernel-phase1/
   └── apps/kernel-api/
       └── (anything in here)

❌ DO NOT TOUCH:
   canonical-deal-os/
   └── (anything in here - this is your teammate's area)
```

### Rule 2: NEVER COMMIT DIRECTLY TO MAIN

Always work on your own branch. Never do this:
```bash
# ❌ WRONG - Don't do this!
git checkout main
git commit -m "my changes"
git push
```

Always do this:
```bash
# ✅ RIGHT - Work on your branch
git checkout yourname/my-feature
git commit -m "my changes"
git push origin yourname/my-feature
# Then create a Pull Request on GitHub
```

### Rule 3: ASK BEFORE CHANGING THESE FILES

If you need to change any of these, **talk to your teammate first**:
- `package.json` (adding new packages)
- `prisma/schema.prisma` (database changes)
- Anything outside `cre-kernel-phase1/`

### Rule 4: WHEN IN DOUBT, ASK

Seriously. It's much better to ask a "dumb question" than to break something and spend hours fixing it.

---

## Safety Checklist ✅

Before you push any code, make sure:

- [ ] The server still starts (`npm run dev:api`)
- [ ] You're on YOUR branch, not main
- [ ] You haven't touched any files in `canonical-deal-os/`
- [ ] Your commit messages make sense
- [ ] You've tested your changes manually

---

## Common Commands Cheat Sheet

| What You Want To Do | Command |
|---------------------|---------|
| Start the Kernel server | `npm run dev:api` |
| Run tests | `npm test` |
| See what files you changed | `git status` |
| See the actual changes | `git diff` |
| Save your changes locally | `git add . && git commit -m "message"` |
| Push to GitHub | `git push origin yourname/branch-name` |
| Get latest code | `git fetch origin && git pull origin main` |
| Switch to your branch | `git checkout yourname/branch-name` |
| Create a new branch | `git checkout -b yourname/new-branch` |
| Undo all changes (CAREFUL!) | `git checkout .` |

---

## Your First Task 🚀

**Suggested starter task:** Add helpful comments to `cre-kernel-phase1/apps/kernel-api/src/projection.ts`

### Why this task?
- You'll learn the code by reading it
- Comments can't break anything
- You'll understand what the Kernel actually does
- Great way to get your first Pull Request merged!

### How to do it:
1. Open the file
2. Read through each function
3. Add comments explaining what the function does in plain English
4. Commit and push
5. Create a Pull Request

---

## Getting Help

**Stuck on something?** Here's what to do:

1. **Google the error message** - Someone has probably had the same problem
2. **Check the code comments** - There might already be explanations
3. **Ask your teammate** - They're happy to help!

**Remember:** Everyone was a beginner once. There are no stupid questions!

---

## Quick Reference: What Each File Does

### In `cre-kernel-phase1/apps/kernel-api/src/`

| File | Purpose |
|------|---------|
| `index.ts` | Main entry point - the server starts here |
| `config.ts` | Configuration settings (port numbers, etc.) |
| `projection.ts` | Financial calculations for deals |
| `prisma.ts` | Database connection setup |
| `server.ts` | Server configuration |

---

Good luck, and welcome to the team! 🎉
