/* Canvas LMS API client. Talks to the Canvas REST API through the Vercel
 * proxy (/api/canvas-proxy) so the token stays out of client-side logs. */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state: string;
  start_at?: string;
  end_at?: string;
  enrollment_term_id?: number;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string;
  due_at?: string;
  points_possible?: number;
  submission_types: string[];
  html_url: string;
  course_id: number;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  items_count: number;
  items_url: string;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string;
  url?: string;
  content_id?: number;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  url: string;
  size: number;
  "content-type": string;
}

function proxyUrl(
  path: string,
  token: string,
  baseUrl: string,
  params?: Record<string, string>,
): string {
  const u = new URL("/api/canvas-proxy", window.location.origin);
  u.searchParams.set("path", path);
  u.searchParams.set("token", token);
  u.searchParams.set("base", baseUrl);
  if (params) {
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  }
  return u.toString();
}

async function canvasFetch(
  path: string,
  token: string,
  baseUrl: string,
  params?: Record<string, string>,
): Promise<any> {
  const res = await fetch(proxyUrl(path, token, baseUrl, params));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Canvas API error ${res.status}` }));
    throw new Error(err.error || `Canvas API error ${res.status}`);
  }
  return res.json();
}

export function createCanvasClient(token: string, baseUrl: string) {
  const fetchPath = (path: string, params?: Record<string, string>) =>
    canvasFetch(path, token, baseUrl, params);

  return {
    /** List active courses for the authenticated user. */
    listCourses: (): Promise<CanvasCourse[]> =>
      fetchPath("/api/v1/courses", { per_page: "50", enrollment_state: "active" }),

    /** List assignments for a course. */
    listAssignments: (courseId: number): Promise<CanvasAssignment[]> =>
      fetchPath(`/api/v1/courses/${courseId}/assignments`, { per_page: "50" }),

    /** List modules for a course. */
    listModules: (courseId: number): Promise<CanvasModule[]> =>
      fetchPath(`/api/v1/courses/${courseId}/modules`, { per_page: "50" }),

    /** List items in a module. */
    listModuleItems: (courseId: number, moduleId: number): Promise<CanvasModuleItem[]> =>
      fetchPath(`/api/v1/courses/${courseId}/modules/${moduleId}/items`, { per_page: "50" }),

    /** List files for a course. */
    listFiles: (courseId: number): Promise<CanvasFile[]> =>
      fetchPath(`/api/v1/courses/${courseId}/files`, { per_page: "50" }),

    /** Test the connection — returns the current user's profile. */
    validate: (): Promise<{ id: number; name: string }> =>
      fetchPath("/api/v1/users/self"),
  };
}

export type CanvasClient = ReturnType<typeof createCanvasClient>;
