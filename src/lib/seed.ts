/* TEMPORARY demo dataset — placeholder study content used for the first-run
   experience and for the AdSense review crawl.

   TODO: replace with content generated from real lecture slides, then delete
   this file (and the demo folder it creates). The seeder is idempotent and
   only runs for visitors who have not onboarded yet. */

import type { Block, Flashcard, Note, QuizQuestion } from "./types";
import type { Repo } from "./db";
import { now } from "./ids";

export const DEMO_FOLDER_ID = "demo-folder";
export const DEMO_NOTE_IDS = {
  scientificMethod: "demo-note-scientific-method",
  cells: "demo-note-cells",
} as const;

function blk(id: string, type: Block["type"], text: string, extra?: Partial<Block>): Block {
  return { id, type, text, ...extra };
}

function note(
  id: string,
  folderId: string,
  title: string,
  sourceText: string,
  blocks: Block[],
  t: number,
): Note {
  return {
    id,
    title,
    sourceKind: "text",
    sourceText,
    sourceMeta: { origin: "Demo content" },
    blocks,
    folderId,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: t,
  };
}

function card(id: string, noteId: string, topic: string, front: string, back: string, t: number): Flashcard {
  return {
    id,
    noteId,
    topic,
    front,
    back,
    due: t,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

function question(
  id: string,
  noteId: string,
  topic: string,
  q: Omit<QuizQuestion, "id" | "noteId" | "topic">,
): QuizQuestion {
  return { id, noteId, topic, ...q };
}

const SCIMETHOD_SOURCE = [
  "The scientific method is a systematic approach to answering questions about the natural world. Scientists form testable explanations, gather evidence through experiments, and refine their understanding based on what the data shows.",
  "A well-designed experiment changes exactly one thing at a time. The independent variable is what the researcher changes; the dependent variable is what gets measured. Controlled variables are held constant, and a control group provides a baseline with no treatment for comparison.",
  "Results must be reproducible: other researchers should be able to follow the same procedure and get similar findings. Replication filters out flukes, errors, and false positives, which is how scientific knowledge becomes trustworthy over time.",
].join(" ");

const CELLS_SOURCE = [
  "Every living thing is made of cells. Some organisms consist of a single cell, while the human body contains trillions. All cells share core features: a boundary separating them from their surroundings, a set of chemical instructions, and machinery to convert energy and build the molecules they need.",
  "Prokaryotic cells, such as bacteria, are small and simple with no nucleus. Eukaryotic cells, found in plants, animals, and fungi, are larger and compartmentalized, storing their DNA inside a membrane-bound nucleus.",
  "Key organelles include the nucleus, which stores DNA and directs activity; mitochondria, which produce most of the cell's energy as ATP; ribosomes, which build proteins; and the cell membrane, a selectively permeable barrier. Plant cells additionally have a cell wall, chloroplasts, and a large central vacuole.",
].join(" ");

/* Seeds the demo folder with two study documents, flashcards and quiz
   questions. Returns true if it created anything, false if the demo
   folder already existed. */
export async function seedDemoData(repo: Repo): Promise<boolean> {
  const folders = await repo.listFolders();
  if (folders.some((f) => f.id === DEMO_FOLDER_ID)) return false;

  const t = now();
  await repo.putFolder({ id: DEMO_FOLDER_ID, name: "Sample Study Set", createdAt: t });

  await repo.putNote(
    note(
      DEMO_NOTE_IDS.scientificMethod,
      DEMO_FOLDER_ID,
      "The Scientific Method: A Step-by-Step Guide",
      SCIMETHOD_SOURCE,
      [
        blk("b1", "heading1", "The Scientific Method: A Step-by-Step Guide"),
        blk("b2", "paragraph", "The scientific method is a systematic approach to answering questions about the natural world. Instead of relying on intuition or tradition, scientists form testable explanations, gather evidence, and refine their understanding based on what the data shows."),
        blk("b3", "heading2", "The Six Steps"),
        blk("b4", "numbered", "Ask a question about an observation."),
        blk("b5", "numbered", "Do background research on what is already known."),
        blk("b6", "numbered", "Form a hypothesis — a testable, falsifiable prediction."),
        blk("b7", "numbered", "Test the hypothesis with a controlled experiment."),
        blk("b8", "numbered", "Analyze the data and draw conclusions."),
        blk("b9", "numbered", "Share results so others can replicate and build on them."),
        blk("b10", "heading2", "Variables and Controls"),
        blk("b11", "paragraph", "A well-designed experiment changes exactly one thing at a time. The variable the researcher deliberately changes is the independent variable; the variable that is measured is the dependent variable. Everything else is held constant."),
        blk("b12", "bullet", "Independent variable — what you change."),
        blk("b13", "bullet", "Dependent variable — what you measure."),
        blk("b14", "bullet", "Controlled variables — what you keep the same."),
        blk("b15", "bullet", "Control group — a baseline with no treatment, used for comparison."),
        blk("b16", "callout", "Common pitfall: correlation is not causation. Two things happening together does not prove that one caused the other.", { emoji: "⚠️" }),
        blk("b17", "heading2", "Why Replication Matters"),
        blk("b18", "paragraph", "A single study is rarely the final word. Results must be reproducible — other researchers should be able to follow the same procedure and get similar findings. Replication filters out flukes, errors, and false positives, which is how scientific knowledge becomes trustworthy over time."),
      ],
      t,
    ),
  );

  await repo.putNote(
    note(
      DEMO_NOTE_IDS.cells,
      DEMO_FOLDER_ID,
      "Cells: The Building Blocks of Life",
      CELLS_SOURCE,
      [
        blk("c1", "heading1", "Cells: The Building Blocks of Life"),
        blk("c2", "paragraph", "Every living thing is made of cells. Some organisms consist of a single cell, while the human body contains trillions. Despite this variety, all cells share a few core features: a boundary that separates them from their surroundings, a set of chemical instructions, and the machinery to convert energy and build the molecules they need."),
        blk("c3", "heading2", "Prokaryotes vs. Eukaryotes"),
        blk("c4", "bullet", "Prokaryotic cells (bacteria and archaea) are small and simple, with no nucleus — their DNA floats freely in the cytoplasm."),
        blk("c5", "bullet", "Eukaryotic cells (plants, animals, fungi) are larger and compartmentalized, with their DNA stored inside a membrane-bound nucleus."),
        blk("c6", "heading2", "Key Organelles"),
        blk("c7", "bullet", "Nucleus — stores DNA and directs cell activities."),
        blk("c8", "bullet", "Mitochondria — produce most of the cell's energy (ATP) through cellular respiration."),
        blk("c9", "bullet", "Ribosomes — build proteins from amino acids."),
        blk("c10", "bullet", "Cell membrane — a selectively permeable barrier that controls what enters and leaves."),
        blk("c11", "callout", "Plant cells have three extras that animal cells lack: a cell wall, chloroplasts for photosynthesis, and a large central vacuole.", { emoji: "🌱" }),
        blk("c12", "heading2", "From Cells to Systems"),
        blk("c13", "paragraph", "Cells specialize and work together: groups of similar cells form tissues, tissues form organs, and organs form systems. Understanding the parts of the cell is the first step to understanding how entire organisms grow, heal, and function."),
      ],
      t,
    ),
  );

  await repo.putCards([
    card("demo-c1", DEMO_NOTE_IDS.scientificMethod, "Basics", "What is a hypothesis?", "A testable, falsifiable prediction that can be supported or rejected by an experiment.", t),
    card("demo-c2", DEMO_NOTE_IDS.scientificMethod, "Variables", "What is the independent variable?", "The variable the researcher deliberately changes to test its effect.", t),
    card("demo-c3", DEMO_NOTE_IDS.scientificMethod, "Variables", "What is the dependent variable?", "The variable that is measured to see whether the independent variable had an effect.", t),
    card("demo-c4", DEMO_NOTE_IDS.scientificMethod, "Experiments", "What is a control group?", "A baseline group kept under standard conditions, used as a comparison against the experimental group.", t),
    card("demo-c5", DEMO_NOTE_IDS.scientificMethod, "Basics", "Why is reproducibility important?", "Results that can be repeated by others are more trustworthy and less likely to be flukes or errors.", t),
    card("demo-c6", DEMO_NOTE_IDS.scientificMethod, "Basics", "What is a scientific theory?", "A well-tested explanation of natural phenomena, supported by a large body of evidence.", t),
    card("demo-c7", DEMO_NOTE_IDS.cells, "Structure", "What does the nucleus do?", "It stores DNA and directs the cell's activities.", t),
    card("demo-c8", DEMO_NOTE_IDS.cells, "Organelles", "What do mitochondria do?", "They produce most of the cell's ATP through cellular respiration.", t),
    card("demo-c9", DEMO_NOTE_IDS.cells, "Organelles", "What do ribosomes do?", "They build proteins from amino acids.", t),
    card("demo-c10", DEMO_NOTE_IDS.cells, "Structure", "What is the cell membrane?", "A selectively permeable barrier that controls what enters and leaves the cell.", t),
    card("demo-c11", DEMO_NOTE_IDS.cells, "Cell types", "How do prokaryotic and eukaryotic cells differ?", "Prokaryotic cells lack a nucleus and membrane-bound organelles; eukaryotic cells have both.", t),
    card("demo-c12", DEMO_NOTE_IDS.cells, "Organelles", "What are chloroplasts?", "Organelles in plant cells where photosynthesis converts light energy into chemical energy.", t),
  ]);

  await repo.putQuestions([
    question("demo-q1", DEMO_NOTE_IDS.scientificMethod, "Variables", {
      type: "mcq",
      difficulty: "basic",
      question: "A researcher tests whether more sleep improves test scores. What is the independent variable?",
      options: ["Hours of sleep", "Test scores", "The students", "The classroom"],
      correctIndex: 0,
      explanation: "The independent variable is what the researcher changes — in this case, how much sleep participants get.",
    }),
    question("demo-q2", DEMO_NOTE_IDS.scientificMethod, "Basics", {
      type: "mcq",
      difficulty: "basic",
      question: "Which statement is a proper hypothesis?",
      options: [
        "Studying improves grades.",
        "Students who study 30 minutes daily will score at least 10% higher on exams than students who do not.",
        "Grades depend on studying.",
        "Everyone should study more.",
      ],
      correctIndex: 1,
      explanation: "A hypothesis must be specific, testable, and falsifiable — the second option makes a concrete, checkable prediction.",
    }),
    question("demo-q3", DEMO_NOTE_IDS.scientificMethod, "Basics", {
      type: "true_false",
      difficulty: "basic",
      question: "A hypothesis that cannot be proven wrong is still scientifically useful.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation: "Falsifiability is a requirement: if a claim cannot possibly be disproven, it cannot be tested scientifically.",
    }),
    question("demo-q4", DEMO_NOTE_IDS.scientificMethod, "Experiments", {
      type: "mcq",
      difficulty: "intermediate",
      question: "The purpose of a control group is to…",
      options: [
        "Make the experiment more complicated.",
        "Provide a baseline for comparison with the experimental group.",
        "Increase the sample size.",
        "Ensure the hypothesis is correct.",
      ],
      correctIndex: 1,
      explanation: "The control group shows what happens without the treatment, so any difference can be attributed to the independent variable.",
    }),
    question("demo-q5", DEMO_NOTE_IDS.scientificMethod, "Basics", {
      type: "true_false",
      difficulty: "intermediate",
      question: "If a result is statistically significant, it is definitely important in the real world.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation: "Statistical significance means the result is unlikely to be chance; real-world importance depends on effect size and context.",
    }),
    question("demo-q6", DEMO_NOTE_IDS.cells, "Cell types", {
      type: "mcq",
      difficulty: "basic",
      question: "Which structure is found in plant cells but not animal cells?",
      options: ["Mitochondria", "Cell membrane", "Chloroplast", "Ribosomes"],
      correctIndex: 2,
      explanation: "Chloroplasts — along with a cell wall and a large central vacuole — are plant-specific features.",
    }),
    question("demo-q7", DEMO_NOTE_IDS.cells, "Cell types", {
      type: "true_false",
      difficulty: "basic",
      question: "Prokaryotic cells store their DNA inside a membrane-bound nucleus.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation: "Prokaryotic cells have no nucleus; their DNA floats freely in the cytoplasm.",
    }),
    question("demo-q8", DEMO_NOTE_IDS.cells, "Organelles", {
      type: "mcq",
      difficulty: "basic",
      question: "Which organelle produces most of the cell's ATP?",
      options: ["Nucleus", "Mitochondria", "Ribosomes", "Cell membrane"],
      correctIndex: 1,
      explanation: "Mitochondria carry out cellular respiration, which generates most of the cell's ATP.",
    }),
    question("demo-q9", DEMO_NOTE_IDS.cells, "Organelles", {
      type: "mcq",
      difficulty: "intermediate",
      question: "Which sequence correctly builds from smallest to largest?",
      options: [
        "Cell → tissue → organ → system",
        "Tissue → cell → organ → system",
        "Organ → tissue → cell → system",
        "Cell → organ → tissue → system",
      ],
      correctIndex: 0,
      explanation: "Similar cells form tissues, tissues form organs, and organs work together in systems.",
    }),
    question("demo-q10", DEMO_NOTE_IDS.cells, "Structure", {
      type: "true_false",
      difficulty: "intermediate",
      question: "The cell membrane lets everything pass through freely.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation: "The cell membrane is selectively permeable — it controls which substances enter and leave the cell.",
    }),
  ]);

  return true;
}
