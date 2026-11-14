export type Plan = "free" | "pro";

export type DeviceViewport = "desktop" | "mobile";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export type MissionStatus = "completed" | "abandoned";

export type StepAction = "click" | "type" | "scroll" | "finish" | "give_up";

export type IssueSeverity = "low" | "medium" | "high" | "none";

export interface Persona {
  id: string;
  name: string;
  description: string;
  age?: number;
  context?: string;
  technicalLevel?: "low" | "medium" | "high";
}

export interface Step {
  id: string;
  personaId: string;
  order: number;
  thought: string;
  frustrationLevel: number;
  action: StepAction;
  elementId: number | null;
  typedText: string | null;
  uxProblem: string | null;
  severity: IssueSeverity;
  annotatedScreenshotPath: string | null;
  cleanScreenshotPath: string | null;
  createdAt: string;
}

export interface TechLog {
  id: string;
  type: "console" | "pageerror" | "http" | "automation";
  message: string;
  url?: string;
  status?: number;
  createdAt: string;
}

export interface Session {
  id: string;
  ownerId?: string;
  targetUrl: string;
  objective: string;
  plan: Plan;
  viewport: DeviceViewport;
  personas: Persona[];
  status: RunStatus;
  steps: Step[];
  techLogs: TechLog[];
  frictionScore: number | null;
  missionStatus: MissionStatus | null;
  recommendations: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
