"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  FilePlus2,
  Flame,
  HardDrive,
} from "lucide-react";
import BrandMark from "./BrandMark";
import {
  chooseProjectDirectory,
  supportsProjectFolders,
  validateProjectFolderName,
  type ProjectDirectoryHandle,
} from "@/lib/project-directory";
import {
  completeOnboarding,
  getDefaultProjectDirectory,
  hasCompletedOnboarding,
  setDefaultProjectDirectory,
} from "@/lib/project-preferences";
import { createFolderProject } from "@/lib/storage";
import { checkpoint } from "@/lib/revisions";
import { loadTemplate } from "@/domain/templates";
import type { Project } from "@/domain/schema";
import styles from "./Onboarding.module.css";

export default function Onboarding() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    null,
  );
  const [name, setName] = useState("My first process");
  const [startingPoint, setStartingPoint] = useState("heating");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [created, setCreated] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getDefaultProjectDirectory(), hasCompletedOnboarding()])
      .then(([saved, completed]) => {
        if (!active) return;
        setSupported(supportsProjectFolders());
        if (completed) {
          router.replace("/workspace");
          return;
        }
        setDirectory(saved);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setSupported(supportsProjectFolders());
        setError(
          "Could not load your saved setup. You can choose a folder again.",
        );
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (step === 1) {
      nameInput.current?.focus();
      nameInput.current?.select();
    } else heading.current?.focus();
  }, [ready, step]);

  async function chooseFolder(change = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      // Start native permission UI in the click's user activation.
      const selected =
        !directory || change ? await chooseProjectDirectory() : directory;
      if (!selected) return;
      if (
        directory &&
        !change &&
        (await selected.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw new Error(
          "Allow access to this folder, or choose a different folder.",
        );
      setDirectory(selected);
      await setDefaultProjectDirectory(selected);
      setStep(1);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not connect this folder. Try choosing it again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function createProject() {
    if (locked.current || !directory) return;
    let projectName;
    try {
      projectName = validateProjectFolderName(name);
    } catch (value) {
      setNameError((value as Error).message);
      nameInput.current?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (!created) {
        if (
          (await directory.requestPermission({ mode: "readwrite" })) !==
          "granted"
        )
          throw new Error(
            "Allow folder access to create your project, or go back and choose another folder.",
          );
        const project: Project =
          startingPoint === "heating"
            ? { ...loadTemplate("heating")!, name: projectName }
            : { version: 1, name: projectName, units: [], edges: [] };
        await createFolderProject(directory, projectName, {
          version: 1,
          project,
          revisions: [checkpoint(project, "Created project")],
        });
        setCreated(true);
      }
      await completeOnboarding();
      router.replace("/workspace");
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not create your project. Please try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <main
      className={`workspace ${styles.page}`}
      data-theme="light"
      data-palette="light"
    >
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-disabled={busy}
          onClick={(event) => {
            if (locked.current) event.preventDefault();
          }}
        >
          <BrandMark size={25} />
          Project CAD
        </Link>
        <Link
          href="/workspace"
          className={styles.resume}
          aria-disabled={busy}
          onClick={(event) => {
            if (locked.current) event.preventDefault();
          }}
        >
          Open existing workspace <ArrowRight size={15} />
        </Link>
      </header>
      {!ready ? (
        <p className={styles.loading} role="status">
          Preparing your workspace…
        </p>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <h2>A place to build.</h2>
            <p>
              Set up your workspace,
              <br />
              then make your first process.
            </p>
            <ol className={styles.steps} aria-label="Setup progress">
              {["Project folder", "First project"].map((label, index) => (
                <li
                  key={label}
                  aria-current={step === index ? "step" : undefined}
                  data-complete={step > index || undefined}
                >
                  <span>{step > index ? <Check size={15} /> : index + 1}</span>
                  <div>
                    {label}
                    <small>
                      {index === 0
                        ? "Choose where your work lives"
                        : "Start blank or use a template"}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            <div className={styles.localNote}>
              <HardDrive size={17} />
              <span>
                Your projects stay on
                <br />
                this computer.
              </span>
            </div>
          </aside>
          <section
            className={styles.content}
            aria-labelledby="setup-title"
            aria-busy={busy}
          >
            <h1 id="setup-title" ref={heading} tabIndex={-1}>
              {step === 0
                ? "A home for your projects."
                : "Make your first process."}
            </h1>
            <p className={styles.intro}>
              {step === 0
                ? "Choose a folder on this computer. Each project gets its own folder, and your changes save automatically."
                : "Give it a name and choose a starting point. You can change the equipment and settings as you work."}
            </p>
            {step === 0 ? (
              <>
                <div className={styles.folder}>
                  <FolderOpen size={32} strokeWidth={1.4} />
                  <div>
                    <strong>{directory?.name ?? "Your project folder"}</strong>
                    <span>
                      {directory
                        ? "Ready to reconnect and continue"
                        : "Choose an existing folder or make a new one"}
                    </span>
                  </div>
                </div>
                {!supported ? (
                  <p className={styles.notice} role="status">
                    To save projects to a folder, open this page in desktop
                    Chrome or Edge. You can still explore an example here.
                  </p>
                ) : null}
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!supported || busy}
                    onClick={() => void chooseFolder()}
                  >
                    {busy
                      ? "Connecting…"
                      : directory
                        ? "Use this folder"
                        : "Choose folder"}
                    <ArrowRight size={16} />
                  </button>
                  {directory ? (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => void chooseFolder(true)}
                    >
                      Choose another folder
                    </button>
                  ) : null}
                </div>
                <Link
                  className={styles.skip}
                  href="/workspace?example=heating"
                  aria-disabled={busy}
                  onClick={(event) => {
                    if (locked.current) event.preventDefault();
                  }}
                >
                  Explore an example first <ArrowRight size={14} />
                </Link>
              </>
            ) : (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void createProject();
                }}
              >
                <div className={styles.field}>
                  <label htmlFor="first-project-name">Project name</label>
                  <input
                    id="first-project-name"
                    ref={nameInput}
                    value={name}
                    maxLength={80}
                    autoComplete="off"
                    disabled={busy || created}
                    aria-invalid={!!nameError}
                    aria-describedby={
                      nameError ? "project-name-error" : "project-destination"
                    }
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameError("");
                      setError("");
                    }}
                  />
                  {nameError ? (
                    <p id="project-name-error" className={styles.error}>
                      {nameError}
                    </p>
                  ) : null}
                  <span id="project-destination" className={styles.destination}>
                    <FolderOpen size={14} />
                    {directory?.name}/{name.trim() || "Your project"}
                  </span>
                </div>
                <fieldset
                  className={styles.startingPoint}
                  disabled={busy || created}
                >
                  <legend>Starting point</legend>
                  {[
                    {
                      value: "heating",
                      title: "Simple heating",
                      description: "A connected example, ready to simulate.",
                      icon: Flame,
                    },
                    {
                      value: "blank",
                      title: "Blank flowsheet",
                      description: "Add your own equipment and streams.",
                      icon: FilePlus2,
                    },
                  ].map((option) => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name="starting-point"
                        value={option.value}
                        checked={startingPoint === option.value}
                        onChange={() => setStartingPoint(option.value)}
                      />
                      <option.icon size={22} strokeWidth={1.5} />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <div className={styles.projectActions}>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={busy || created}
                    onClick={() => {
                      setStep(0);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={15} />
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !name.trim()}
                  >
                    {busy
                      ? "Creating…"
                      : created
                        ? "Open workspace"
                        : "Create project"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      <footer className={styles.footer}>Design. Build. Explore.</footer>
    </main>
  );
}
