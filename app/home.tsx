"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import PhotoEditor from "./components/photo-editor";
import MediaViewer, { type MediaViewerItem } from "./components/media-viewer";
import RecordThumb from "./components/record-thumb";
import MediaFileButton from "./components/media-file-button";
import ResponsiblePicker from "./components/responsible-picker";
import { ACTIVE_PROJECT_STORAGE_KEY, ACTIVE_TYPE_STORAGE_KEY, COMPLETED_STATUS, MAX_PHOTOS, MAX_VIDEOS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, MEDIA_BUCKET, clientRecordTypes, isProjectCompleted, isRecordArchived, normalizeProjectStatus, normalizeStatus, projectStatuses, recordTypes as recordTypeList, responsibilities, RESPONSIBLE_OTHER, statuses as statusList, type ProjectStatus } from "@/lib/constants";
import { buildResponsiblePayload, normalizeResponsibleParty, responsibleClassSlug, responsibleDisplay, responsibleOtherText, type ResponsibleParty } from "@/lib/responsible";
import { copyText, shareOrCopyText } from "@/lib/copy-text";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import { imageTooLarge, isImageFile, isVideoFile, mediaFileName, mimeOf, videoTooLarge } from "@/lib/media";
import type { RegisterPayload } from "@/lib/register-data";

type Status = typeof statusList[number];
type Priority = "Kritinis" | "Aukštas" | "Vidutinis" | "Žemas";
type RecordType = "Brokas" | "Apimtis" | "Papildoma apimtis" | "Užduotis";

type Project = {
  id: string;
  name: string;
  address: string;
  open: number;
  overdue: number;
  status?: ProjectStatus;
  archived?: boolean;
  clientsSeeStaffRecords?: boolean;
};

type DefectPhoto = {
  id: string;
  url: string;
  caption: string;
  kind?: "photo";
  fileName?: string;
  objectKey?: string;
};

type DefectVideo = {
  id: string;
  url: string;
  caption: string;
  kind?: "video";
  fileName?: string;
  objectKey?: string;
};

type DefectItem = {
  id: string;
  issue: string;
  requiredWork: string;
};

type PhotoDraft = DefectPhoto & { file: File };
type VideoDraft = DefectVideo & { file: File };
type PhotoEditorTarget =
  | { kind: "draft"; photoId: string; url: string; fileName?: string; revokeUrl?: string }
  | { kind: "saved"; defectId: string; photoId: string; url: string; fileName?: string; objectKey?: string; revokeUrl?: string };

type Defect = {
  id: string;
  code: string;
  projectId: string;
  recordType: RecordType;
  zone: string;
  room?: string;
  location?: string;
  origin?: "staff" | "client";
  createdByName?: string;
  createdByEmail?: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  responsible: string;
  assignee: string;
  due: string;
  created: string;
  photo?: string;
  photos?: DefectPhoto[];
  videos?: DefectVideo[];
  items?: DefectItem[];
  selected: boolean;
  requiredWork?: string;
  resolution?: string;
  requestedBy?: string;
  price?: string;
  notes?: string;
  archived?: boolean;
  version?: number;
};

type Profile = { displayName: string; email: string; role: "staff" | "client" };

type DetailMetaDraft = {
  responsible: ResponsibleParty;
  assignee: string;
  due: string;
  status: Status;
  requestedBy: string;
  price: string;
  notes: string;
  resolution: string;
};

function responsibleCell(defect: Defect) {
  const party = normalizeResponsibleParty(defect.responsible);
  const other = responsibleOtherText(defect.responsible, defect.assignee);
  return { party, other, slug: responsibleClassSlug(defect.responsible) };
}

function metaDraftFromDefect(defect: Defect): DetailMetaDraft {
  const party = normalizeResponsibleParty(defect.responsible);
  return {
    responsible: party,
    assignee: responsibleOtherText(defect.responsible, defect.assignee),
    due: defect.due,
    status: defect.status,
    requestedBy: defect.requestedBy ?? "",
    price: defect.price ?? "",
    notes: defect.notes ?? "",
    resolution: defect.resolution ?? "",
  };
}

const initialProjects: Project[] = [];
const initialDefects: Defect[] = [];

const statusTabs: Array<Status | "Visi"> = ["Visi", ...statusList];
const recordTypes: RecordType[] = [...recordTypeList];
const clientCaptureTypes: RecordType[] = [...clientRecordTypes];

const recordTypeMeta: Record<RecordType, { icon: string; hint: string; save: string }> = {
  Brokas: { icon: "!", hint: "Defektas objekte · reikia foto", save: "Išsaugoti broką" },
  Apimtis: { icon: "▤", hint: "Kas dar nesumontuota", save: "Išsaugoti apimtį" },
  "Papildoma apimtis": { icon: "+", hint: "Papildomas darbas ar gaminys", save: "Išsaugoti papildymą" },
  Užduotis: { icon: "✓", hint: "Ką komandai padaryti", save: "Išsaugoti užduotį" },
};

const recordCopy: Record<RecordType, { title: string; titleLabel: string; titlePlaceholder: string; section: string; sectionHelp: string; item: string; issueLabel: string; issuePlaceholder: string; workLabel: string; workPlaceholder: string; save: string }> = {
  Brokas: {
    title: "Fiksuoti broką", titleLabel: "Pozicijos pavadinimas *", titlePlaceholder: "Pvz., Miegamojo spinta",
    section: "Pastaba", sectionHelp: "Nebūtina — galite pridėti vėliau.", item: "Pastaba",
    issueLabel: "Pastaba", issuePlaceholder: "Pvz., apibraižytas kairysis fasadas", workLabel: "Ką pataisyti?", workPlaceholder: "Pvz., pakeisti fasadą", save: "Išsaugoti broką",
  },
  Apimtis: {
    title: "Registruoti apimtį", titleLabel: "Pozicijos pavadinimas *", titlePlaceholder: "Pvz., TV spintelė",
    section: "Pastaba", sectionHelp: "Nebūtina — galite pridėti vėliau.", item: "Pastaba",
    issueLabel: "Pastaba", issuePlaceholder: "Pvz., TV spintelė dar nesumontuota", workLabel: "Ką atlikti?", workPlaceholder: "Pvz., pristatyti ir sumontuoti", save: "Išsaugoti apimtį",
  },
  "Papildoma apimtis": {
    title: "Papildoma apimtis", titleLabel: "Pozicijos pavadinimas *", titlePlaceholder: "Pvz., Papildomos lentynos",
    section: "Pastaba", sectionHelp: "Nebūtina — galite pridėti vėliau.", item: "Pastaba",
    issueLabel: "Pastaba", issuePlaceholder: "Pvz., užsakovas prašo dviejų lentynų", workLabel: "Ką atlikti?", workPlaceholder: "Pvz., pamatuoti ir pagaminti", save: "Išsaugoti papildymą",
  },
  Užduotis: {
    title: "Nauja užduotis", titleLabel: "Užduoties pavadinimas *", titlePlaceholder: "Pvz., Pervežti plokštes",
    section: "Pastaba", sectionHelp: "Nebūtina — galite pridėti vėliau.", item: "Pastaba",
    issueLabel: "Pastaba", issuePlaceholder: "Pvz., paimti plokštes iš objekto", workLabel: "Rezultatas", workPlaceholder: "Pvz., grąžinti į objektą", save: "Išsaugoti užduotį",
  },
};

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function statusClass(status: Status) {
  return `status status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatCreated(value: string) {
  if (!value.includes("T")) return value;
  const date = new Date(value);
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 2) return "Ką tik";
  if (diffMinutes < 60) return `Prieš ${diffMinutes} min.`;
  if (diffMinutes < 24 * 60) return `Prieš ${Math.floor(diffMinutes / 60)} val.`;
  return new Intl.DateTimeFormat("lt-LT", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function normalizeDefects(items: Defect[]) {
  return items.map((item) => ({
    ...item,
    recordType: item.recordType ?? "Brokas",
    status: normalizeStatus(item.status),
    priority: item.priority as Priority,
    created: formatCreated(item.created),
  }));
}

function defectPhotosFor(defect: Defect | null): DefectPhoto[] {
  if (!defect) return [];
  if (defect.photos?.length) return defect.photos;
  return defect.photo ? [{ id: `legacy-${defect.id}`, url: defect.photo, caption: "" }] : [];
}

function defectVideosFor(defect: Defect | null): DefectVideo[] {
  return defect?.videos ?? [];
}

function defectMediaFor(defect: Defect | null): MediaViewerItem[] {
  return [
    ...defectPhotosFor(defect).map((item) => ({ id: item.id, url: item.url, kind: "photo" as const, caption: item.caption, fileName: item.fileName })),
    ...defectVideosFor(defect).map((item) => ({ id: item.id, url: item.url, kind: "video" as const, caption: item.caption, fileName: item.fileName })),
  ];
}

function mediaLine(photos: number, videos: number, notes: number, extra?: string) {
  const parts = [
    photos ? countText(photos, "nuotrauka", "nuotraukos", "nuotraukų") : "",
    videos ? countText(videos, "video", "video", "video") : "",
    notes ? countText(notes, "pastaba", "pastabos", "pastabų") : "",
    extra?.trim() || "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function recordTypeClass(recordType: RecordType) {
  const value = recordType === "Papildoma apimtis" ? "papildoma" : recordType.toLocaleLowerCase("lt");
  return `record-type type-${value}`;
}

function isClientOrigin(defect: { origin?: string }) {
  return defect.origin === "client";
}

function originBadge(defect: { origin?: string; createdByName?: string; createdByEmail?: string }) {
  if (!isClientOrigin(defect)) return null;
  const who = defect.createdByName || defect.createdByEmail || "Klientas";
  return <span className="origin-badge origin-client" title={defect.createdByEmail || who}>Klientas · {who}</span>;
}

function formatPrice(value?: string) {
  if (!value) return "Nenurodyta";
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(number) : value;
}

function defectItemsFor(defect: Defect | null): DefectItem[] {
  if (!defect) return [];
  if (defect.items?.length) return defect.items;
  return defect.description ? [{ id: `legacy-${defect.id}`, issue: defect.description, requiredWork: defect.requiredWork ?? "" }] : [];
}

function placeLabel(defect: Defect) {
  return defect.location || [defect.room, defect.zone].filter(Boolean).join(" · ") || defect.zone;
}

function blankIssue(): DefectItem {
  return { id: randomId(), issue: "", requiredWork: "" };
}

function countText(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  const form = lastTwo >= 11 && lastTwo <= 19 ? many : last === 1 ? one : last >= 2 && last <= 9 ? few : many;
  return `${value} ${form}`;
}

type HomeProps = {
  initialData?: RegisterPayload | null;
};

export default function Home({ initialData = null }: HomeProps) {
  const [projectId, setProjectId] = useState(() => initialData?.projects?.[0]?.id ?? "");
  const projectIdRef = useRef(initialData?.projects?.[0]?.id ?? "");
  const [projects, setProjects] = useState<Project[]>(() => initialData?.projects ?? initialProjects);
  const [defects, setDefects] = useState<Defect[]>(() => (initialData?.defects ? normalizeDefects(initialData.defects as Defect[]) : initialDefects));
  const [profile, setProfile] = useState<Profile>(() => initialData?.user ?? { displayName: "", email: "", role: "client" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [activeStatus, setActiveStatus] = useState<Status | "Visi">("Visi");
  const [search, setSearch] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureStep, setCaptureStep] = useState<"type" | "form">("type");
  const [captureSaving, setCaptureSaving] = useState(false);
  const [showCaptureNote, setShowCaptureNote] = useState(false);
  const [showCaptureMore, setShowCaptureMore] = useState(false);
  const [captureRecordType, setCaptureRecordType] = useState<RecordType>("Brokas");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reportMode, setReportMode] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [videoDrafts, setVideoDrafts] = useState<VideoDraft[]>([]);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [detailPhotoDragActive, setDetailPhotoDragActive] = useState(false);
  const [issueDrafts, setIssueDrafts] = useState<DefectItem[]>([blankIssue()]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState<number | null>(null);
  const [captureViewerIndex, setCaptureViewerIndex] = useState<number | null>(null);
  const [showDetailNote, setShowDetailNote] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectAddress, setEditProjectAddress] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState<ProjectStatus>("Vykdomas");
  const [editProjectSaving, setEditProjectSaving] = useState(false);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [responsibleFilter, setResponsibleFilter] = useState("Visi");
  const [priorityFilter, setPriorityFilter] = useState("Visi");
  const [typeFilter, setTypeFilter] = useState<RecordType | "Visi">("Visi");
  const [originFilter, setOriginFilter] = useState<"Visi" | "Distyle" | "Klientas">("Visi");
  const [reportOptions, setReportOptions] = useState({ photos: true, descriptions: true, responsibility: true, commercial: true });
  const [connection, setConnection] = useState<"loading" | "synced" | "demo">(() => (initialData ? "synced" : "loading"));
  const [toast, setToast] = useState("");
  const [photoEditorTarget, setPhotoEditorTarget] = useState<PhotoEditorTarget | null>(null);
  const [photoEditorSaving, setPhotoEditorSaving] = useState(false);
  const [annotatePromptPhotoId, setAnnotatePromptPhotoId] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completePhoto, setCompletePhoto] = useState<File | null>(null);
  const [completePhotoPreview, setCompletePhotoPreview] = useState<string | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);
  const [detailMetaDraft, setDetailMetaDraft] = useState<DetailMetaDraft | null>(null);
  const [detailMetaSaving, setDetailMetaSaving] = useState(false);
  const [captureResponsible, setCaptureResponsible] = useState<ResponsibleParty>("Montuotojai");
  const [captureResponsibleOther, setCaptureResponsibleOther] = useState("");

  useEffect(() => {
    let active = true;
    const storedProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    const storedType = window.localStorage.getItem(ACTIVE_TYPE_STORAGE_KEY) as RecordType | null;
    if (storedProjectId) projectIdRef.current = storedProjectId;
    if (storedType && recordTypes.includes(storedType)) setCaptureRecordType(storedType);
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    const join = params.get("join");

    async function loadRegister() {
      const response = await fetch("/api/register", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { projects?: Project[]; defects?: Defect[]; user?: Profile; error?: string };
      if (!response.ok) throw new Error(payload.error || "Duomenų bazė nepasiekiama");
      return payload;
    }

    (async () => {
      try {
        let joinedProjectId = "";
        if (join) {
          const joinResponse = await fetch("/api/projects/join", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: join }),
          });
          const joinPayload = await joinResponse.json() as { projectId?: string; error?: string };
          if (!joinResponse.ok || !joinPayload.projectId) {
            if (active) setToast(joinPayload.error || "Nepavyko prisijungti prie projekto");
          } else {
            joinedProjectId = joinPayload.projectId;
          }
        } else if (invite) {
          await fetch("/api/invites/accept", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: invite }),
          });
        }

        const data = await loadRegister();
        if (!active || !data.user || !data.projects || !data.defects) return;
        setProjects(data.projects);
        setDefects(normalizeDefects(data.defects));
        setProfile(data.user);
        const nextProjectId = [joinedProjectId, projectIdRef.current, data.projects[0]?.id]
          .find((id) => id && data.projects!.some((project) => project.id === id)) ?? "";
        if (nextProjectId) {
          projectIdRef.current = nextProjectId;
          setProjectId(nextProjectId);
          window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, nextProjectId);
        }
        if (joinedProjectId) {
          const name = data.projects.find((project) => project.id === joinedProjectId)?.name ?? "objektas";
          setToast(`Prisijungta prie objekto: ${name}`);
        }
        if (join || invite) window.history.replaceState({}, "", "/");
        setConnection("synced");
      } catch {
        if (active) setConnection("demo");
      }
    })();

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!detailId) {
      setDetailMetaDraft(null);
      return;
    }
    const current = defects.find((item) => item.id === detailId);
    if (current) setDetailMetaDraft(metaDraftFromDefect(current));
  }, [detailId]);

  useEffect(() => {
    const modalOpen = captureOpen || reportMode || Boolean(detailId) || completeOpen || mediaViewerIndex != null || Boolean(photoEditorTarget) || projectPickerOpen || filtersOpen || inviteOpen || newProjectOpen || Boolean(editProjectId);
    if (!modalOpen) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [captureOpen, completeOpen, detailId, editProjectId, filtersOpen, inviteOpen, mediaViewerIndex, newProjectOpen, photoEditorTarget, projectPickerOpen, reportMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMediaViewerIndex(null);
      setShowDetailNote(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailId]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function selectProject(nextProjectId: string, announce = true) {
    const nextProject = projects.find((project) => project.id === nextProjectId);
    projectIdRef.current = nextProjectId;
    setProjectId(nextProjectId);
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, nextProjectId);
    setProjectPickerOpen(false);
    setMobileMenu(false);
    setDetailId(null);
    if (announce && nextProject) showToast(`Aktyvus projektas: ${nextProject.name}`);
  }

  const resolvedProjectId = projectId || projects[0]?.id || "";
  const isClient = profile.role === "client";
  const isStaff = profile.role === "staff";
  const captureTypes = isClient ? clientCaptureTypes : recordTypes;
  const activeProject = projects.find((project) => project.id === resolvedProjectId) ?? { id: "", name: isClient ? "Objektas nepriskirtas" : "Nėra projekto", address: "", open: 0, overdue: 0, status: "Vykdomas" as ProjectStatus, archived: false, clientsSeeStaffRecords: false };
  const projectCompleted = isProjectCompleted(activeProject);

  function openProjectPicker() {
    if (isClient) return;
    setProjectSearch("");
    setProjectPickerOpen(true);
  }
  const sidebarProjects = useMemo(() => {
    const active = projects.filter((project) => !isProjectCompleted(project));
    const current = projects.find((project) => project.id === resolvedProjectId);
    if (current && isProjectCompleted(current) && !active.some((project) => project.id === current.id)) {
      return [current, ...active];
    }
    return active;
  }, [projects, resolvedProjectId]);
  const filteredProjects = useMemo(() => {
    const source = showCompletedProjects ? projects : projects.filter((project) => !isProjectCompleted(project));
    const term = projectSearch.trim().toLocaleLowerCase("lt");
    if (!term) return source;
    return source.filter((project) => `${project.name} ${project.address}`.toLocaleLowerCase("lt").includes(term));
  }, [projectSearch, projects, showCompletedProjects]);
  const visibleDefects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("lt");
    return defects.filter((defect) => {
      const inProject = defect.projectId === resolvedProjectId;
      const archived = isRecordArchived(defect);
      const inStatus = activeStatus === COMPLETED_STATUS
        ? archived
        : !archived && (activeStatus === "Visi" || defect.status === activeStatus);
      const inSearch = !term || `${defect.code} ${defect.recordType} ${defect.title} ${placeLabel(defect)} ${defect.responsible} ${defect.requestedBy ?? ""} ${defect.notes ?? ""}`.toLocaleLowerCase("lt").includes(term);
      const inResponsible = responsibleFilter === "Visi" || normalizeResponsibleParty(defect.responsible) === responsibleFilter;
      const inPriority = priorityFilter === "Visi" || defect.priority === priorityFilter;
      const inType = typeFilter === "Visi" || defect.recordType === typeFilter;
      const inOrigin = originFilter === "Visi"
        || (originFilter === "Klientas" ? isClientOrigin(defect) : !isClientOrigin(defect));
      const clientAllowed = !isClient || defect.recordType !== "Užduotis";
      return inProject && inStatus && inSearch && inResponsible && inPriority && inType && inOrigin && clientAllowed;
    });
  }, [activeStatus, defects, isClient, originFilter, priorityFilter, resolvedProjectId, responsibleFilter, search, typeFilter]);

  const detail = defects.find((defect) => defect.id === detailId) ?? null;
  const detailMetaDirty = useMemo(() => {
    if (!detail || !detailMetaDraft) return false;
    return JSON.stringify(metaDraftFromDefect(detail)) !== JSON.stringify(detailMetaDraft);
  }, [detail, detailMetaDraft]);
  const detailPhotos = defectPhotosFor(detail);
  const detailVideos = defectVideosFor(detail);
  const detailMedia = defectMediaFor(detail);
  const detailItems = defectItemsFor(detail);
  const captureMedia: MediaViewerItem[] = [
    ...photoDrafts.map((item) => ({ id: item.id, url: item.url, kind: "photo" as const, caption: item.caption, fileName: item.fileName })),
    ...videoDrafts.map((item) => ({ id: item.id, url: item.url, kind: "video" as const, caption: item.caption, fileName: item.fileName })),
  ];
  const showDetailNotes = showDetailNote || detailItems.some((item) => item.issue || item.requiredWork);
  const projectDefects = defects.filter((defect) => defect.projectId === resolvedProjectId);
  const activeProjectDefects = projectDefects.filter((defect) => !isRecordArchived(defect));
  const archivedCount = projectDefects.filter((defect) => isRecordArchived(defect)).length;
  const reportRows = visibleDefects.filter((defect) => defect.selected);
  const exportRows = reportRows.length ? reportRows : visibleDefects;
  const reportFilterTags = useMemo(() => {
    const tags = [
      typeFilter !== "Visi" ? typeFilter : null,
      originFilter !== "Visi" ? originFilter : null,
      activeStatus !== "Visi" ? activeStatus : null,
      responsibleFilter !== "Visi" ? responsibleFilter : null,
      priorityFilter !== "Visi" ? priorityFilter : null,
    ].filter(Boolean) as string[];
    return tags.length ? tags : ["Visi filtrai"];
  }, [activeStatus, originFilter, priorityFilter, responsibleFilter, typeFilter]);
  const openCount = activeProjectDefects.length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = activeProjectDefects.filter((defect) => defect.due !== "Nenustatyta" && defect.due < today).length;

  function openCapture() {
    if (projectCompleted) {
      showToast("Projektas baigtas. Pakeiskite būseną į „Vykdomas“, jei vėl fiksuojate.");
      return;
    }
    if (isClient && captureRecordType === "Užduotis") setCaptureRecordType("Brokas");
    setCaptureStep("type");
    setShowCaptureNote(false);
    setShowCaptureMore(false);
    setCaptureOpen(true);
  }

  function closeCapture() {
    setCaptureOpen(false);
    setCaptureStep("type");
    setShowCaptureNote(false);
    setShowCaptureMore(false);
    setCaptureViewerIndex(null);
    setAnnotatePromptPhotoId(null);
    setCaptureResponsible("Montuotojai");
    setCaptureResponsibleOther("");
  }

  function chooseCaptureType(type: RecordType) {
    if (isClient && type === "Užduotis") return;
    setCaptureRecordType(type);
    window.localStorage.setItem(ACTIVE_TYPE_STORAGE_KEY, type);
    setCaptureStep("form");
  }

  async function addDefect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const validIssues = issueDrafts
      .map((item) => ({ ...item, issue: item.issue.trim(), requiredWork: item.requiredWork.trim() }))
      .filter((item) => item.issue);
    const title = String(data.get("title") ?? "").trim();
    const room = String(data.get("room") ?? "").trim();
    const zone = String(data.get("zone") ?? "").trim();
    if (!resolvedProjectId) {
      showToast(isClient ? "Nuoroda nepriskyrė objekto. Paprašykite Distyle naujos nuorodos." : "Pirmiausia pasirinkite projektą");
      return;
    }
    if (!title || !room || !zone) {
      showToast("Nurodykite pavadinimą, patalpą ir zoną");
      return;
    }
    if (captureRecordType === "Brokas" && !photoDrafts.length && !videoDrafts.length) {
      showToast("Brokui reikia bent vienos nuotraukos arba video");
      return;
    }
    if (captureResponsible === RESPONSIBLE_OTHER && !captureResponsibleOther.trim()) {
      showToast("Pasirinkus „Kita“, įrašykite kas atsakingas");
      return;
    }
    if (isClient && captureRecordType === "Užduotis") {
      showToast("Klientai negali kurti užduočių");
      return;
    }
    window.localStorage.setItem(ACTIVE_TYPE_STORAGE_KEY, captureRecordType);
    const responsiblePayload = buildResponsiblePayload(captureResponsible, captureResponsibleOther);
    const body = {
      projectId: resolvedProjectId,
      recordType: captureRecordType,
      title,
      room,
      zone,
      issues: validIssues,
      priority: String(data.get("priority") ?? "Vidutinis"),
      responsible: responsiblePayload.responsible,
      assignee: responsiblePayload.assignee,
      due: String(data.get("due") ?? "").trim(),
      requestedBy: String(data.get("requestedBy") ?? "").trim(),
      price: String(data.get("price") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
    };
    const drafts = { photos: [...photoDrafts], videos: [...videoDrafts] };
    setCaptureSaving(true);
    try {
      const response = await fetch("/api/defects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { defect?: Defect; error?: string };
      if (!response.ok || !payload.defect) throw new Error(payload.error || "Nepavyko išsaugoti");
      let saved = { ...payload.defect, status: normalizeStatus(payload.defect.status), priority: payload.defect.priority as Priority, created: formatCreated(payload.defect.created), selected: payload.defect.selected !== false };
      setDefects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setDetailId(null);
      setMediaViewerIndex(null);
      setCaptureViewerIndex(null);
      setConnection("synced");
      closeCapture();
      setPhotoDrafts([]);
      setVideoDrafts([]);
      setIssueDrafts([blankIssue()]);
      showToast(`${saved.code} išsaugotas`);
      if (drafts.photos.length || drafts.videos.length) {
        try {
          const uploaded = await uploadMediaToRecord(saved.id, saved.projectId, drafts.photos, drafts.videos);
          saved = {
            ...saved,
            photos: uploaded.filter((item) => item.kind !== "video") as DefectPhoto[],
            videos: uploaded.filter((item) => item.kind === "video") as DefectVideo[],
            photo: uploaded.find((item) => item.kind !== "video")?.url,
          };
          setDefects((items) => items.map((item) => item.id === saved.id ? saved : item));
        } catch (mediaError) {
          showToast(`Įrašas išsaugotas. Nuotraukų įkelti nepavyko: ${errorMessage(mediaError, "bandykite pridėti vėliau")}`);
        }
      }
      drafts.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      drafts.videos.forEach((video) => URL.revokeObjectURL(video.url));
    } catch (error) {
      showToast(errorMessage(error, "Nepavyko išsaugoti įrašo"));
    } finally {
      setCaptureSaving(false);
    }
  }

  async function uploadMediaToRecord(recordId: string, nextProjectId: string, photos: PhotoDraft[], videos: VideoDraft[]) {
    const supabase = createBrowserSupabase();
    const media: Array<{ id: string; objectKey: string; fileName: string; mimeType: string; mediaKind: "photo" | "video"; fileSize: number; caption: string }> = [];
    const all = [
      ...photos.map((item) => ({ ...item, kind: "photo" as const })),
      ...videos.map((item) => ({ ...item, kind: "video" as const })),
    ];
    for (const item of all) {
      const mediaId = randomId();
      const fileName = mediaFileName(item.file, item.kind);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || item.kind;
      const objectKey = `${nextProjectId}/${recordId}/${mediaId}-${safeName}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(objectKey, item.file, {
        contentType: mimeOf(item.file, item.kind),
        upsert: false,
      });
      if (error) throw new Error(errorMessage(error, "Failo įkelti į saugyklą nepavyko"));
      media.push({
        id: mediaId,
        objectKey,
        fileName,
        mimeType: mimeOf(item.file, item.kind),
        mediaKind: item.kind,
        fileSize: item.file.size,
        caption: item.caption,
      });
    }
    if (!media.length) return [];
    const response = await fetch(`/api/defects/${recordId}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ media }),
    });
    const payload = await response.json() as { media?: Array<DefectPhoto | DefectVideo>; error?: string };
    if (!response.ok || !payload.media) throw new Error(payload.error || "Failų įkelti nepavyko");
    return payload.media;
  }

  function appendPhotoDrafts(incomingFiles: File[], options?: { promptAnnotate?: boolean }) {
    const files = incomingFiles.filter((file) => isImageFile(file) && !imageTooLarge(file));
    if (!files.length) return showToast("Pasirinkite nuotrauką iki 10 MB");
    const freeSlots = Math.max(0, MAX_PHOTOS - photoDrafts.length);
    const accepted = files.slice(0, freeSlots);
    if (!accepted.length) return showToast(`Prie vieno įrašo galima pridėti iki ${MAX_PHOTOS} nuotraukų`);
    const added = accepted.map((file) => ({ id: randomId(), file, url: URL.createObjectURL(file), caption: "" }));
    setPhotoDrafts((items) => [...items, ...added]);
    if (accepted.length < files.length) showToast(`Pridėta ${accepted.length} iš ${files.length} pasirinktų nuotraukų`);
    if (options?.promptAnnotate && added.length === 1) setAnnotatePromptPhotoId(added[0].id);
  }

  function appendVideoDrafts(incomingFiles: File[]) {
    const files = incomingFiles.filter((file) => isVideoFile(file) && !videoTooLarge(file));
    if (!files.length) return showToast("Pasirinkite video iki 40 MB");
    const freeSlots = Math.max(0, MAX_VIDEOS - videoDrafts.length);
    const accepted = files.slice(0, freeSlots);
    if (!accepted.length) return showToast(`Prie vieno įrašo galima pridėti ${MAX_VIDEOS} video`);
    setVideoDrafts((items) => [...items, ...accepted.map((file) => ({ id: randomId(), file, fileName: file.name, url: URL.createObjectURL(file), caption: "" }))]);
    if (accepted.length < files.length) showToast(`Pridėta ${accepted.length} iš ${files.length} pasirinktų video`);
  }

  function handlePhotos(files: FileList, fromCamera = false) {
    appendPhotoDrafts(Array.from(files), { promptAnnotate: fromCamera });
  }

  function handleVideos(files: FileList) {
    appendVideoDrafts(Array.from(files));
  }

  function handlePhotoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPhotoDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    const photos = files.filter((file) => isImageFile(file));
    const videos = files.filter((file) => isVideoFile(file));
    if (photos.length) appendPhotoDrafts(photos);
    if (videos.length) appendVideoDrafts(videos);
    if (!photos.length && !videos.length) showToast("Nutempkite nuotraukas arba video failus");
  }

  function removePhotoDraft(id: string) {
    setPhotoDrafts((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return items.filter((item) => item.id !== id);
    });
    setAnnotatePromptPhotoId((current) => current === id ? null : current);
  }

  function updatePhotoCaption(id: string, caption: string) {
    setPhotoDrafts((items) => items.map((item) => item.id === id ? { ...item, caption } : item));
  }

  function closePhotoEditor() {
    setPhotoEditorTarget((target) => {
      if (target?.revokeUrl) URL.revokeObjectURL(target.revokeUrl);
      return null;
    });
  }

  function editPhotoDraft(photo: PhotoDraft) {
    setCaptureViewerIndex(null);
    setMediaViewerIndex(null);
    setAnnotatePromptPhotoId(null);
    setPhotoEditorTarget({ kind: "draft", photoId: photo.id, url: photo.url, fileName: photo.file.name });
  }

  async function editSavedPhoto(photo: DefectPhoto) {
    if (!detailId || photo.id.startsWith("local-") || photo.id.startsWith("legacy-")) return;
    setCaptureViewerIndex(null);
    setMediaViewerIndex(null);
    setAnnotatePromptPhotoId(null);
    try {
      let url = photo.url;
      let revokeUrl: string | undefined;
      if (!photo.url.startsWith("blob:")) {
        const supabase = createBrowserSupabase();
        if (photo.objectKey) {
          const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(photo.objectKey);
          if (error || !data) throw new Error(error?.message || "Nuotraukos atsisiųsti nepavyko");
          revokeUrl = URL.createObjectURL(data);
          url = revokeUrl;
        } else {
          const response = await fetch(`/api/media/${detailId}/${photo.id}`);
          if (!response.ok) throw new Error("Nuotraukos atsisiųsti nepavyko");
          revokeUrl = URL.createObjectURL(await response.blob());
          url = revokeUrl;
        }
      }
      setPhotoEditorTarget({
        kind: "saved",
        defectId: detailId,
        photoId: photo.id,
        url,
        fileName: photo.fileName,
        objectKey: photo.objectKey,
        revokeUrl,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nuotraukos atidaryti nepavyko");
    }
  }

  async function saveEditedPhoto(blob: Blob) {
    const target = photoEditorTarget;
    if (!target) return;
    const baseName = (target.fileName || "nuotrauka").replace(/\.[^.]+$/, "").slice(0, 70);
    const file = new File([blob], `${baseName}-pazymeta.jpg`, { type: blob.type || "image/jpeg" });
    if (target.kind === "draft") {
      const nextUrl = URL.createObjectURL(file);
      setPhotoDrafts((items) => items.map((photo) => {
        if (photo.id !== target.photoId) return photo;
        if (photo.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
        return { ...photo, file, url: nextUrl };
      }));
      if (target.revokeUrl) URL.revokeObjectURL(target.revokeUrl);
      setPhotoEditorTarget(null);
      setAnnotatePromptPhotoId(null);
      showToast("Nuotraukos pažymėjimai išsaugoti");
      return;
    }

    setPhotoEditorSaving(true);
    try {
      const supabase = createBrowserSupabase();
      const objectKey = target.objectKey
        || defects.find((item) => item.id === target.defectId)?.photos?.find((photo) => photo.id === target.photoId)?.objectKey
        || `${resolvedProjectId}/${target.defectId}/${target.photoId}.jpg`;
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(objectKey, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      const response = await fetch(`/api/media/${target.defectId}/${target.photoId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectKey }) });
      const payload = await response.json() as { url?: string; fileName?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Nuotraukos išsaugoti nepavyko");
      setDefects((items) => items.map((item) => {
        if (item.id !== target.defectId) return item;
        const photos = defectPhotosFor(item).map((photo) => photo.id === target.photoId ? { ...photo, url: payload.url!, fileName: payload.fileName || file.name, objectKey } : photo);
        return { ...item, photos, photo: photos[0]?.url };
      }));
      if (target.revokeUrl) URL.revokeObjectURL(target.revokeUrl);
      setPhotoEditorTarget(null);
      setConnection("synced");
      showToast("Pažymėta nuotrauka išsaugota");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nuotraukos išsaugoti nepavyko");
    } finally {
      setPhotoEditorSaving(false);
    }
  }

  function removeVideoDraft(id: string) {
    setVideoDrafts((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return items.filter((item) => item.id !== id);
    });
  }

  function updateVideoCaption(id: string, caption: string) {
    setVideoDrafts((items) => items.map((item) => item.id === id ? { ...item, caption } : item));
  }

  function updateIssueDraft(id: string, patch: Partial<DefectItem>) {
    setIssueDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeIssueDraft(id: string) {
    setIssueDrafts((items) => items.length > 1 ? items.filter((item) => item.id !== id) : items);
  }

  function updateDetail(patch: Partial<Defect>, persist = false) {
    if (!detailId) return;
    setDefects((items) => items.map((item) => (item.id === detailId ? { ...item, ...patch } : item)));
    if (persist) void persistPatch(detailId, patch);
  }

  function toggleSelected(id: string) {
    const current = defects.find((item) => item.id === id);
    if (!current) return;
    const selected = !current.selected;
    setDefects((items) => items.map((item) => (item.id === id ? { ...item, selected } : item)));
    void persistPatch(id, { selected });
  }

  async function persistPatch(id: string, patch: Partial<Defect>) {
    try {
      const response = await fetch(`/api/defects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Atnaujinti nepavyko");
      }
      const payload = await response.json() as { defect: Partial<Defect> };
      setDefects((items) => items.map((item) => item.id === id ? {
        ...item,
        ...payload.defect,
        status: payload.defect.status ? normalizeStatus(String(payload.defect.status)) : item.status,
        archived: payload.defect.archived ?? item.archived,
      } : item));
      setConnection("synced");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Atnaujinti nepavyko");
      return false;
    }
  }

  async function saveDetailMeta() {
    if (!detailId || !detail || !detailMetaDraft) return;
    if (detailMetaDraft.responsible === RESPONSIBLE_OTHER && !detailMetaDraft.assignee.trim()) {
      showToast("Pasirinkus „Kita“, įrašykite kas atsakingas");
      return;
    }
    setDetailMetaSaving(true);
    const payload = {
      ...buildResponsiblePayload(detailMetaDraft.responsible, detailMetaDraft.assignee),
      due: detailMetaDraft.due || "Nenustatyta",
      status: detailMetaDraft.status,
      requestedBy: detailMetaDraft.requestedBy,
      price: detailMetaDraft.price,
      notes: detailMetaDraft.notes,
      resolution: detailMetaDraft.resolution,
    };
    const saved = await persistPatch(detailId, payload);
    setDetailMetaSaving(false);
    if (saved) {
      setDetailMetaDraft({
        responsible: detailMetaDraft.responsible,
        assignee: payload.assignee,
        due: payload.due,
        status: payload.status,
        requestedBy: payload.requestedBy,
        price: payload.price,
        notes: payload.notes,
        resolution: payload.resolution,
      });
      showToast("Pakeitimai išsaugoti");
    }
  }

  async function archiveDetail(kind: "complete" | "delete") {
    if (!detailId) return;
    if (kind === "complete") {
      setCompletePhoto(null);
      if (completePhotoPreview) URL.revokeObjectURL(completePhotoPreview);
      setCompletePhotoPreview(null);
      setCompleteOpen(true);
      return;
    }
    if (!window.confirm("Ištrinti šį įrašą? Jis bus perkeltas į archyvą ir dings iš aktyvaus sąrašo.")) return;
    const id = detailId;
    setMediaViewerIndex(null);
    setCaptureViewerIndex(null);
    setDetailId(null);
    const saved = await persistPatch(id, { archived: true });
    if (!saved) {
      setDetailId(id);
      return;
    }
    showToast("Įrašas perkeltas į archyvą");
  }

  async function confirmComplete() {
    if (!detailId) return;
    const id = detailId;
    const photo = completePhoto;
    setCompleteOpen(false);
    setCompletePhoto(null);
    if (completePhotoPreview) URL.revokeObjectURL(completePhotoPreview);
    setCompletePhotoPreview(null);
    setMediaViewerIndex(null);
    setCaptureViewerIndex(null);
    setDetailId(null);
    setCompleteSaving(true);
    setDefects((items) => items.map((item) => item.id === id ? { ...item, status: COMPLETED_STATUS, archived: true } : item));
    setActiveStatus(COMPLETED_STATUS);
    try {
      const saved = await persistPatch(id, { status: COMPLETED_STATUS, archived: true });
      if (!saved) {
        setDetailId(id);
        return;
      }
      if (photo) {
        try {
          const draft: PhotoDraft = { id: randomId(), file: photo, url: URL.createObjectURL(photo), caption: "Po remonto" };
          try {
            const uploaded = await uploadMediaToRecord(id, resolvedProjectId, [draft], []);
            setDefects((items) => items.map((item) => item.id === id ? {
              ...item,
              photos: [...defectPhotosFor(item), ...uploaded.filter((media) => media.kind !== "video") as DefectPhoto[]],
              photo: item.photo ?? uploaded.find((media) => media.kind !== "video")?.url,
            } : item));
          } finally {
            URL.revokeObjectURL(draft.url);
          }
          showToast("✓ Baigtas · po remonto nuotrauka įkelta");
        } catch (error) {
          showToast(`✓ Baigtas. Po remonto nuotraukos įkelti nepavyko: ${errorMessage(error, "bandykite vėliau")}`);
        }
      } else {
        showToast("✓ Įrašas pažymėtas kaip Baigtas");
      }
    } catch (error) {
      setDetailId(id);
      showToast(errorMessage(error, "Užbaigti nepavyko"));
    } finally {
      setCompleteSaving(false);
    }
  }

  function handleCompletePhoto(files: FileList) {
    const file = files[0];
    if (!file) return;
    if (!isImageFile(file) || imageTooLarge(file)) {
      showToast("Pasirinkite nuotrauką iki 10 MB");
      return;
    }
    if (completePhotoPreview) URL.revokeObjectURL(completePhotoPreview);
    setCompletePhoto(file);
    setCompletePhotoPreview(URL.createObjectURL(file));
  }

  function clearCompletePhoto() {
    if (completePhotoPreview) URL.revokeObjectURL(completePhotoPreview);
    setCompletePhoto(null);
    setCompletePhotoPreview(null);
  }

  async function restoreDetail() {
    if (!detailId) return;
    const saved = await persistPatch(detailId, { archived: false, status: "Naujas" });
    if (!saved) return;
    showToast("Įrašas grąžintas į sąrašą");
  }

  function updateDetailItem(itemId: string, patch: Partial<DefectItem>) {
    if (!detailId) return;
    setDefects((items) => items.map((item) => item.id === detailId ? {
      ...item,
      items: defectItemsFor(item).map((issue) => issue.id === itemId ? { ...issue, ...patch } : issue),
    } : item));
  }

  function addDetailItem() {
    if (!detailId) return;
    setDefects((items) => items.map((item) => item.id === detailId ? {
      ...item,
      items: [...defectItemsFor(item), blankIssue()],
    } : item));
  }

  function removeDetailItem(itemId: string) {
    if (!detailId) return;
    setDefects((items) => items.map((item) => item.id === detailId ? {
      ...item,
      items: defectItemsFor(item).filter((issue) => issue.id !== itemId),
    } : item));
  }

  async function saveDetailItems() {
    if (!detailId) return;
    const items = defectItemsFor(defects.find((defect) => defect.id === detailId) ?? null)
      .map((item) => ({ ...item, issue: item.issue.trim(), requiredWork: item.requiredWork.trim() }))
      .filter((item) => item.issue);
    const saved = await persistPatch(detailId, { items });
    showToast(saved ? "Aprašymas ir reikalingi darbai išsaugoti" : "Pakeitimai liko demonstracinėje sesijoje");
  }

  async function uploadMoreMediaFiles(incomingFiles: File[], kind: "photo" | "video") {
    if (!detailId || !resolvedProjectId) return;
    const files = incomingFiles.filter((file) => kind === "photo" ? isImageFile(file) && !imageTooLarge(file) : isVideoFile(file) && !videoTooLarge(file));
    if (!files.length) return showToast(kind === "photo" ? "Pasirinkite nuotrauką iki 10 MB" : "Pasirinkite video iki 40 MB");
    const maxCount = kind === "photo" ? MAX_PHOTOS : MAX_VIDEOS;
    const existingCount = kind === "photo" ? detailPhotos.length : detailVideos.length;
    const selected = files.slice(0, Math.max(0, maxCount - existingCount));
    if (!selected.length) return showToast(kind === "photo" ? `Galima pridėti iki ${MAX_PHOTOS} nuotraukų` : `Galima pridėti ${MAX_VIDEOS} video`);
    const drafts = selected.map((file) => ({ id: randomId(), file, url: URL.createObjectURL(file), caption: "", fileName: file.name }));
    try {
      const uploaded = await uploadMediaToRecord(
        detailId,
        resolvedProjectId,
        kind === "photo" ? drafts : [],
        kind === "video" ? drafts : [],
      );
      const saved = uploaded.filter((item) => kind === "photo" ? item.kind !== "video" : item.kind === "video");
      setDefects((items) => items.map((item) => item.id === detailId ? kind === "photo" ? {
        ...item,
        photos: [...defectPhotosFor(item), ...saved as DefectPhoto[]],
        photo: defectPhotosFor(item)[0]?.url ?? saved[0]?.url,
      } : {
        ...item,
        videos: [...defectVideosFor(item), ...saved as DefectVideo[]],
      } : item));
      drafts.forEach((media) => URL.revokeObjectURL(media.url));
      showToast(kind === "photo" ? `Pridėta nuotraukų: ${saved.length}` : `Pridėta video: ${saved.length}`);
    } catch (error) {
      setConnection("demo");
      showToast(error instanceof Error ? error.message : "Failų įkelti nepavyko");
    }
  }

  function uploadMorePhotos(files: FileList) {
    void uploadMoreMediaFiles(Array.from(files), "photo");
  }

  function uploadMoreVideos(files: FileList) {
    void uploadMoreMediaFiles(Array.from(files), "video");
  }

  function handleMorePhotoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDetailPhotoDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    const photos = files.filter((file) => isImageFile(file));
    const videos = files.filter((file) => isVideoFile(file));
    if (photos.length) void uploadMoreMediaFiles(photos, "photo");
    if (videos.length) void uploadMoreMediaFiles(videos, "video");
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const optimistic: Project = { id: randomId(), name, address: "", open: 0, overdue: 0, status: "Vykdomas", archived: false };
    setProjects((items) => [optimistic, ...items]);
    selectProject(optimistic.id, false);
    setNewProjectOpen(false);
    form.reset();
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error("Nepavyko išsaugoti");
      const payload = await response.json() as { project: Project };
      setProjects((items) => items.map((item) => item.id === optimistic.id ? payload.project : item));
      projectIdRef.current = payload.project.id;
      setProjectId(payload.project.id);
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, payload.project.id);
      showToast(`Projektas „${payload.project.name}“ sukurtas ir pasirinktas`);
    } catch {
      showToast("Projektas sukurtas demonstracinėje sesijoje");
    }
  }

  function openEditProject(project: Project) {
    setEditProjectId(project.id);
    setEditProjectName(project.name);
    setEditProjectAddress(project.address ?? "");
    setEditProjectStatus(normalizeProjectStatus(project.status));
    setProjectPickerOpen(false);
  }

  async function saveEditedProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProjectId || !editProjectName.trim()) return;
    setEditProjectSaving(true);
    try {
      const response = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editProjectId,
          name: editProjectName.trim(),
          address: editProjectAddress.trim(),
          status: editProjectStatus,
        }),
      });
      const payload = await response.json() as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Projekto atnaujinti nepavyko");
      setProjects((items) => items.map((item) => item.id === editProjectId ? {
        ...item,
        name: payload.project!.name,
        address: payload.project!.address,
        status: payload.project!.status,
        archived: payload.project!.archived,
      } : item));
      setEditProjectId(null);
      showToast(payload.project.status === "Baigtas" ? "Projektas pažymėtas kaip baigtas" : "Projektas atnaujintas");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Projekto atnaujinti nepavyko");
    } finally {
      setEditProjectSaving(false);
    }
  }

  async function deleteProjectById(projectIdToDelete: string) {
    const target = projects.find((project) => project.id === projectIdToDelete);
    if (!window.confirm(`Ištrinti projektą „${target?.name ?? ""}“ ir visus jo įrašus? Šio veiksmo atšaukti negalima.`)) return;
    setEditProjectSaving(true);
    try {
      const response = await fetch(`/api/projects?id=${encodeURIComponent(projectIdToDelete)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Projekto ištrinti nepavyko");
      setProjects((items) => items.filter((item) => item.id !== projectIdToDelete));
      setDefects((items) => items.filter((item) => item.projectId !== projectIdToDelete));
      if (editProjectId === projectIdToDelete) setEditProjectId(null);
      const next = projects.find((project) => project.id !== projectIdToDelete && !isProjectCompleted(project)) ?? projects.find((project) => project.id !== projectIdToDelete);
      if (next) selectProject(next.id, false);
      else {
        projectIdRef.current = "";
        setProjectId("");
        window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
      }
      showToast("Projektas ištrintas");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Projekto ištrinti nepavyko");
    } finally {
      setEditProjectSaving(false);
    }
  }

  async function deleteEditedProject() {
    if (!editProjectId) return;
    await deleteProjectById(editProjectId);
  }

  async function downloadCsv() {
    if (!exportRows.length) return showToast("Nėra ką eksportuoti");
    if (!reportRows.length) showToast(`Eksportuojami visi matomi įrašai (${exportRows.length})`);
    const rows = exportRows;
    const columns = ["Tipas", "Kodas", "Zona", "Pozicija / užduotis", "Aprašymas", "Reikalingi darbai", "Nuotraukų sk.", "Video sk.", "Kas paprašė", "Kaina, EUR", "Pastabos", "Prioritetas", "Būsena", "Atsakingas", "Kita (detaliau)", "Terminas"];
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [columns, ...rows.map((item) => {
      const issues = defectItemsFor(item);
      return [
        item.recordType,
        item.code,
        placeLabel(item),
        item.title,
        issues.map((issue, index) => `${index + 1}. ${issue.issue}`).join("\n"),
        issues.map((issue, index) => `${index + 1}. ${issue.requiredWork || "—"}`).join("\n"),
        defectPhotosFor(item).length,
        defectVideosFor(item).length,
        item.requestedBy ?? "",
        item.price ?? "",
        item.notes ?? "",
        item.priority,
        item.status,
        normalizeResponsibleParty(item.responsible),
        responsibleOtherText(item.responsible, item.assignee),
        item.due,
      ];
    })]
      .map((row) => row.map((value) => escape(String(value))).join(";"))
      .join("\n");
    const fileName = `${activeProject.name.replace(/[^a-zA-Z0-9Ą-ž]+/g, "_")}_ataskaita.csv`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    if (typeof navigator.share === "function" && typeof File !== "undefined") {
      try {
        const file = new File([blob], fileName, { type: "text/csv" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function setVisibleSelection(selected: boolean) {
    const ids = new Set(visibleDefects.map((item) => item.id));
    setDefects((items) => items.map((item) => ids.has(item.id) ? { ...item, selected } : item));
    visibleDefects.forEach((item) => {
      if (item.selected !== selected) void persistPatch(item.id, { selected });
    });
  }

  function printReport() {
    if (!exportRows.length) return showToast("Nėra ką eksportuoti");
    if (!reportRows.length) showToast(`Spausdinami visi matomi įrašai (${exportRows.length})`);
    const previousTitle = document.title;
    document.title = `${activeProject.name} – darbų ataskaita`;
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 1200);
  }

  async function openInviteModal() {
    setInviteEmail("");
    setInviteLink("");
    setShareLink("");
    setInviteOpen(true);
    if (!resolvedProjectId) return;
    setShareLinkLoading(true);
    try {
      const response = await fetch("/api/projects/share-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: resolvedProjectId, origin: window.location.origin }),
      });
      const payload = await response.json() as { link?: string; error?: string };
      if (!response.ok || !payload.link) throw new Error(payload.error || "Nuorodos sukurti nepavyko");
      setShareLink(payload.link);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nuorodos sukurti nepavyko");
    } finally {
      setShareLinkLoading(false);
    }
  }

  async function copyShareLink() {
    if (!shareLink) return;
    const result = await shareOrCopyText(shareLink, `Brokų registravimas (${activeProject.name})`);
    if (result === "shared") showToast("Nuoroda paruošta siuntimui");
    else if (result === "copied") showToast("Nuoroda nukopijuota");
    else if (result === "cancelled") return;
    else showToast("Laikykite ant nuorodos — pasirinkite „Kopijuoti“");
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !inviteEmail.trim()) return;
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, email: inviteEmail.trim(), origin: window.location.origin }),
      });
      const payload = await response.json() as { invite?: { token: string }; error?: string };
      if (!response.ok || !payload.invite) throw new Error(payload.error || "Kvietimo sukurti nepavyko");
      const link = `${window.location.origin}/login?invite=${payload.invite.token}`;
      setInviteLink(link);
      const copied = await copyText(link);
      showToast(copied ? "Kvietimo nuoroda nukopijuota" : "Nuoroda sukurta — nukopijuokite iš lauko");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Kvietimo sukurti nepavyko");
    }
  }

  async function toggleClientVisibility() {
    if (!projectId || profile.role !== "staff") return;
    const next = !activeProject.clientsSeeStaffRecords;
    const response = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: projectId, clientsSeeStaffRecords: next }),
    });
    if (!response.ok) return showToast("Nustatymo pakeisti nepavyko");
    setProjects((items) => items.map((item) => item.id === projectId ? { ...item, clientsSeeStaffRecords: next } : item));
    showToast(next ? "Klientas matys ir Distyle brokus" : "Klientas matys tik savo brokus");
  }

  return (
    <div className={`app-shell ${isClient ? "client-mode" : ""}`}>
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">D</div>
          <div><strong>DISTYLE</strong><span>Darbų ir brokų registras</span></div>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Uždaryti meniu">×</button>
        </div>

        <nav className="main-nav" aria-label="Pagrindinis meniu">
          {isStaff ? (
            <>
              <button className="nav-active"><span>▦</span> Apžvalga</button>
              <button type="button" className="nav-invite" onClick={() => { void openInviteModal(); setMobileMenu(false); }}><span>🔗</span> Klientų nuoroda</button>
              <button onClick={() => { openProjectPicker(); setMobileMenu(false); }}><span>□</span> Projektai <b>{projects.length}</b></button>
              <button onClick={() => { setTypeFilter("Užduotis"); setMobileMenu(false); }}><span>✓</span> Užduotys <b>{defects.filter((item) => item.recordType === "Užduotis" && !isRecordArchived(item)).length}</b></button>
              <button onClick={() => { setReportMode(true); setMobileMenu(false); }}><span>⇩</span> Ataskaitos</button>
            </>
          ) : (
            <>
              <button className="nav-active" onClick={() => setMobileMenu(false)}><span>▦</span> Mano įrašai</button>
              <button type="button" onClick={() => { openCapture(); setMobileMenu(false); }}><span>＋</span> Fiksuoti</button>
            </>
          )}
        </nav>

        <div className="sidebar-label"><span>{isClient ? "Objektas" : "Aktyvūs projektai"}</span>{isStaff && <button onClick={() => setNewProjectOpen(true)} aria-label="Pridėti projektą">+</button>}</div>
        <div className="project-list">
          {isClient ? (
            activeProject.id ? (
              <button type="button" className="project-active" disabled>
                <span className="project-dot" />
                <span><strong>{activeProject.name}</strong><small>{activeProject.address || "Fiksavimas tik šiame objekte"}</small></span>
              </button>
            ) : (
              <p className="project-choice-empty">Objektas nepriskirtas</p>
            )
          ) : sidebarProjects.map((project) => (
            <button key={project.id} className={project.id === resolvedProjectId ? "project-active" : ""} onClick={() => selectProject(project.id)}>
              <span className="project-dot" />
              <span><strong>{project.name}</strong><small>{isProjectCompleted(project) ? "Baigtas" : project.address || "Informaciją papildysite vėliau"}</small></span>
              <em>{defects.filter((item) => item.projectId === project.id && !isRecordArchived(item)).length}</em>
            </button>
          ))}
        </div>

        <div className="profile-card">
          <div className="avatar">{initials(profile.displayName || profile.email || "U")}</div>
          <div><strong>{profile.displayName || "Naudotojas"}</strong><span>{profile.role === "staff" ? "Distyle komanda" : "Klientas"}</span></div>
          <form action="/logout" method="post"><button type="submit" aria-label="Atsijungti">⎋</button></form>
        </div>
      </aside>

      {mobileMenu && <button className="menu-scrim" onClick={() => setMobileMenu(false)} aria-label="Uždaryti meniu" />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Atidaryti meniu">☰</button>
          <label className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ieškoti įrašo, zonos ar atsakingo…" /><kbd>⌘ K</kbd></label>
          <span className={`sync-pill sync-${connection}`}>{connection === "synced" ? "Sinchronizuota" : connection === "loading" ? "Jungiama…" : "Nėra ryšio"}</span>
          <button className="capture-top" onClick={openCapture}><span>＋</span> Naujas įrašas</button>
        </header>

        <div className="workspace">
          <section className="project-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> {isClient ? "Fiksuojate objekte" : "Aktyvus projektas"}</div>
              <div className="title-row">
                <h1>{activeProject.name}</h1>
                {isStaff && activeProject.id ? (
                  <button type="button" onClick={() => openEditProject(activeProject)} aria-label="Redaguoti projektą">✎</button>
                ) : null}
              </div>
              <p>
                {projectCompleted ? "Baigtas projektas · " : ""}
                {activeProject.address || (isClient ? "Čia fiksuojate brokus, apimtis ir papildomas apimtis." : "Projekto informaciją galėsite papildyti vėliau")}
              </p>
            </div>
            {isStaff && (
              <button type="button" className="mobile-client-link" onClick={() => void openInviteModal()}>
                <span className="mobile-client-link-icon" aria-hidden>🔗</span>
                <span className="mobile-client-link-text">
                  <strong>Klientų nuoroda</strong>
                  <small>Siųskite klientui — galės fiksuoti brokus objekte</small>
                </span>
                <span className="mobile-client-link-chevron" aria-hidden>›</span>
              </button>
            )}
            {isClient && (
              <button type="button" className="mobile-client-link" onClick={openCapture}>
                <span className="mobile-client-link-icon" aria-hidden>＋</span>
                <span className="mobile-client-link-text">
                  <strong>Naujas fiksavimas</strong>
                  <small>Brokas, apimtis arba papildoma apimtis</small>
                </span>
                <span className="mobile-client-link-chevron" aria-hidden>›</span>
              </button>
            )}
            {isClient && !resolvedProjectId && (
              <p className="share-link-hint">Ši paskyra dar nepriskirta objektui. Atidarykite Distyle atsiųstą nuorodą dar kartą.</p>
            )}
            {isStaff && (
            <div className="heading-actions">
              <button className="secondary-button heading-invite-button" onClick={() => void openInviteModal()}>Klientų nuoroda</button>
              <button className="secondary-button" onClick={() => setReportMode(true)}>Ataskaita / PDF</button>
            </div>
            )}
          </section>

          {!isClient && (
          <section className="metrics" aria-label="Objekto suvestinė">
            <article><div><span>Atviri įrašai</span><b className="metric-icon red">!</b></div><strong>{openCount}</strong><p>Brokai, apimtys ir užduotys</p></article>
            <article><div><span>Pradelsti</span><b className="metric-icon amber">↗</b></div><strong>{overdueCount}</strong><p>Reikia jūsų dėmesio</p></article>
            <article><div><span>Vykdomi</span><b className="metric-icon blue">→</b></div><strong>{activeProjectDefects.filter((item) => item.status === "Vykdoma").length}</strong><p>Priskirti atsakingiems</p></article>
            <article><div><span>Baigti</span><b className="metric-icon green">✓</b></div><strong>{archivedCount}</strong><p>Archyvuoti įrašai</p></article>
          </section>
          )}

          <section className="register-card">
            <div className="register-header">
              <div><h2>{isClient ? "Jūsų fiksavimai" : "Objekto įrašai"}</h2><p>{isClient ? `${visibleDefects.length} įrašai šiame objekte` : `${visibleDefects.length} įrašai pagal pasirinktus filtrus`}</p></div>
              <div className="register-actions"><button className="secondary-button" onClick={() => setFiltersOpen((value) => !value)}>Filtrai <span className="filter-count">{Number(responsibleFilter !== "Visi") + Number(priorityFilter !== "Visi") + Number(typeFilter !== "Visi") + Number(isStaff && originFilter !== "Visi")}</span></button><button className="secondary-button">Rikiuoti: Naujausi <span>⌄</span></button></div>
            </div>

            {filtersOpen && (
              <div className="filter-panel">
                <label><span>Įrašo tipas</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as RecordType | "Visi")}><option>Visi</option>{captureTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                {isStaff && <label><span>Kas įkėlė</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as "Visi" | "Distyle" | "Klientas")}><option>Visi</option><option>Distyle</option><option>Klientas</option></select></label>}
                <label><span>Atsakingas</span><select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option>Visi</option>{responsibilities.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>Prioritetas</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>Visi</option><option>Kritinis</option><option>Aukštas</option><option>Vidutinis</option><option>Žemas</option></select></label>
                <button onClick={() => { setResponsibleFilter("Visi"); setPriorityFilter("Visi"); setTypeFilter("Visi"); setOriginFilter("Visi"); }}>Išvalyti filtrus</button>
              </div>
            )}

            <div className="status-tabs" role="tablist">
              {statusTabs.map((status) => {
                const count = status === "Visi"
                  ? activeProjectDefects.length
                  : status === COMPLETED_STATUS
                    ? archivedCount
                    : activeProjectDefects.filter((item) => item.status === status).length;
                return <button key={status} className={activeStatus === status ? "tab-active" : ""} onClick={() => setActiveStatus(status)}>{status} <span>{count}</span></button>;
              })}
            </div>

            <div className="defect-table-wrap">
              <table className="defect-table">
                <thead><tr><th className="check-cell"><input type="checkbox" checked={visibleDefects.length > 0 && visibleDefects.every((item) => item.selected)} onChange={(event) => setVisibleSelection(event.target.checked)} aria-label="Pažymėti visus matomus" /></th><th>Įrašo informacija</th><th>Būsena</th><th>Atsakingas</th><th>Terminas</th><th /></tr></thead>
                <tbody>
                  {visibleDefects.map((defect) => {
                    const photos = defectPhotosFor(defect);
                    const videos = defectVideosFor(defect);
                    const items = defectItemsFor(defect);
                    const summary = mediaLine(photos.length, videos.length, items.length, items[0]?.issue ?? defect.description);
                    return (
                    <tr key={defect.id} className={`${detailId === defect.id ? "row-active" : ""} ${reportMode && !defect.selected ? "report-excluded" : ""}`} onClick={() => setDetailId(defect.id)}>
                      <td className="check-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={defect.selected} onChange={() => toggleSelected(defect.id)} aria-label={`Įtraukti ${defect.code}`} /></td>
                      <td>
                        <RecordThumb
                          recordId={defect.id}
                          photoUrl={photos[0]?.url}
                          photoId={photos[0]?.id}
                          videoUrl={!photos[0] ? videos[0]?.url : undefined}
                          photoCount={photos.length}
                          videoCount={videos.length}
                          fallbackLabel={initials(defect.zone.split("·")[0])}
                          placeholderClass={`photo-${Number(defect.id.length) % 4}`}
                        />
                        <div className="defect-main"><div><span className={`priority-dot priority-${defect.priority.toLowerCase()}`} /> <b>{defect.code}</b><span className={recordTypeClass(defect.recordType)}>{defect.recordType}</span>{isStaff && originBadge(defect)}<small>{placeLabel(defect)}</small></div><strong>{defect.title}</strong>{summary ? <p>{summary}</p> : null}</div>
                      </td>
                      <td><span className={statusClass(defect.status)}><i />{defect.status}</span></td>
                      <td><div className="responsible-cell">{(() => { const r = responsibleCell(defect); return (<><span className={`company-avatar company-${r.slug}`}>{initials(r.party)}</span><div><strong>{r.party}</strong><small>{r.other || "—"}</small></div></>); })()}</div></td>
                      <td><strong className={defect.due < today && !isRecordArchived(defect) ? "due-over" : ""}>{defect.due}</strong><small>{defect.created}</small></td>
                      <td><button className="row-button" aria-label="Atidaryti broką">›</button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>

              <div className="defect-cards">
                {visibleDefects.map((defect) => {
                  const photos = defectPhotosFor(defect);
                  const videos = defectVideosFor(defect);
                  const items = defectItemsFor(defect);
                  const summary = mediaLine(photos.length, videos.length, items.length, items[0]?.issue ?? defect.description);
                  return (
                  <article key={defect.id} className={reportMode && !defect.selected ? "report-excluded" : ""} onClick={() => setDetailId(defect.id)}>
                    <div className="mobile-card-top"><label onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={defect.selected} onChange={() => toggleSelected(defect.id)} /></label><span className={`priority-dot priority-${defect.priority.toLowerCase()}`} /><b>{defect.code}</b><span className={recordTypeClass(defect.recordType)}>{defect.recordType}</span>{isStaff && originBadge(defect)}<small>{placeLabel(defect)}</small><span className={statusClass(defect.status)}><i />{defect.status}</span></div>
                    <div className="mobile-card-body">
                      <RecordThumb
                        recordId={defect.id}
                        photoUrl={photos[0]?.url}
                        photoId={photos[0]?.id}
                        videoUrl={!photos[0] ? videos[0]?.url : undefined}
                        photoCount={photos.length}
                        videoCount={videos.length}
                        fallbackLabel={initials(defect.zone.split("·")[0])}
                        placeholderClass={`photo-${Number(defect.id.length) % 4}`}
                      />
                      <div><h3>{defect.title}</h3>{summary ? <p>{summary}</p> : null}</div>
                    </div>
                    <div className="mobile-card-bottom"><div className="responsible-cell">{(() => { const r = responsibleCell(defect); return (<><span className={`company-avatar company-${r.slug}`}>{initials(r.party)}</span><strong>{r.party}</strong></>); })()}</div><span className={defect.due < today && !isRecordArchived(defect) ? "due-over" : ""}>{defect.due}</span></div>
                  </article>
                ); })}
              </div>
              {connection !== "loading" && !visibleDefects.length && (
                <div className="register-empty">
                  <strong>Šiame objekte dar nėra įrašų</strong>
                  <span>Paspaudę ＋ greitai fiksuosite broką, apimtį ar užduotį.</span>
                  <button type="button" className="primary-button" onClick={openCapture}>＋ Naujas įrašas</button>
                </div>
              )}
            </div>

            {visibleDefects.length > 20 ? <div className="table-footer"><p>Rodomi {visibleDefects.length} iš {projectDefects.length} įrašų</p></div> : null}
          </section>

          <section className="print-report">
            <header><div><strong>DISTYLE · OBJEKTO DARBŲ ATASKAITA</strong><h1>{activeProject.name}</h1><p>{activeProject.address ? `${activeProject.address} · ` : ""}{new Intl.DateTimeFormat("lt-LT").format(new Date())}</p></div><span>{exportRows.length} pozicijos</span></header>
            {exportRows.map((defect) => {
              const photos = defectPhotosFor(defect);
              const items = defectItemsFor(defect);
              return <article key={defect.id}>
                <div className="print-defect-head"><div><small>{defect.code} · {defect.recordType} · {isClientOrigin(defect) ? `Klientas (${defect.createdByName || defect.createdByEmail || "—"})` : "Distyle"} · {placeLabel(defect)}</small><h2>{defect.title}</h2></div><span className={statusClass(defect.status)}><i />{defect.status}</span></div>
                {reportOptions.photos && photos.length > 0 && <div className="print-photo-grid">{photos.map((photo, index) => <figure key={photo.id}><img src={photo.url} alt={`${defect.title}, nuotrauka ${index + 1}`} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div>}
                {reportOptions.descriptions && <div className="print-issues">{items.map((item, index) => <div key={item.id}><b>{index + 1}</b><p><strong>{recordCopy[defect.recordType].issueLabel.replace(" *", "")}:</strong> {item.issue}<br /><strong>{recordCopy[defect.recordType].workLabel}:</strong> {item.requiredWork || "Nenurodyta"}</p></div>)}</div>}
                {reportOptions.commercial && defect.recordType === "Papildoma apimtis" && <div className="print-commercial"><span>Kas paprašė: <b>{defect.requestedBy || "Nenurodyta"}</b></span><span>Kaina: <b>{formatPrice(defect.price)}</b></span>{defect.notes && <p><b>Pastabos:</b> {defect.notes}</p>}</div>}
                {reportOptions.responsibility && <footer><span>Atsakingas: <b>{responsibleDisplay(defect.responsible, defect.assignee)}</b></span><span>Terminas: <b>{defect.due}</b></span><span>Prioritetas: <b>{defect.priority}</b></span></footer>}
              </article>;
            })}
          </section>
        </div>
      </main>

      <nav className={`mobile-bottom-nav ${isClient ? "client-bottom-nav" : ""}`} aria-label="Mobilus meniu">
        {isClient ? (
          <>
            <button className="bottom-active" onClick={() => setTypeFilter("Visi")}><span>▦</span>Mano įrašai</button>
            <button className="mobile-capture" onClick={openCapture} aria-label="Naujas fiksavimas">＋</button>
            <form action="/logout" method="post"><button type="submit"><span>⎋</span>Atsijungti</button></form>
          </>
        ) : (
          <>
            <button className="bottom-active" onClick={() => setTypeFilter("Visi")}><span>▦</span>Apžvalga</button>
            <button onClick={openProjectPicker}><span>□</span>Projektai</button>
            <button className="mobile-capture" onClick={openCapture} aria-label="Naujas įrašas">＋</button>
            <button onClick={() => setTypeFilter("Užduotis")}><span>✓</span>Užduotys</button>
            <button onClick={() => setReportMode(true)}><span>⇩</span>Ataskaitos</button>
          </>
        )}
      </nav>

      {captureOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="capture-title">
          <button className="modal-scrim" onClick={closeCapture} aria-label="Uždaryti" />
          {captureStep === "type" ? (
            <section className="capture-panel capture-type-step">
              <div className="panel-handle" />
              <div className="panel-title"><div><span>Naujas įrašas</span><h2 id="capture-title">Kas tai?</h2></div><button type="button" onClick={closeCapture} aria-label="Uždaryti">×</button></div>
              <p className="capture-type-lead">Pasirinkite, ką fiksuojate objekte.</p>
              <div className="capture-type-grid">
                {captureTypes.map((type) => (
                  <button type="button" key={type} className={captureRecordType === type ? "type-selected" : ""} onClick={() => chooseCaptureType(type)}>
                    <span>{recordTypeMeta[type].icon}</span>
                    <strong>{type}</strong>
                    <small>{recordTypeMeta[type].hint}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : (
          <form className="capture-panel" onSubmit={addDefect}>
            <div className="panel-handle" />
            <div className="panel-title"><div><span>Naujas įrašas</span><h2 id="capture-title">{recordCopy[captureRecordType].title}</h2></div><button type="button" onClick={closeCapture} aria-label="Uždaryti">×</button></div>
            <button type="button" className="capture-back" onClick={() => setCaptureStep("type")}>← {captureRecordType} · keisti tipą</button>
            <div className="capture-project"><span className="live-dot" /><div><small>Objektas</small><strong>{activeProject.name}</strong></div>{isStaff && projects.length > 1 && <button type="button" onClick={openProjectPicker}>Keisti</button>}</div>
            <div className="form-grid capture-essentials">
              <label className="wide"><span>{recordCopy[captureRecordType].titleLabel}</span><input name="title" required placeholder={recordCopy[captureRecordType].titlePlaceholder} enterKeyHint="next" autoComplete="off" /></label>
              <label><span>Patalpa *</span><input name="room" required placeholder="Pvz., Miegamasis" enterKeyHint="next" autoComplete="off" /></label>
              <label><span>Zona *</span><input name="zone" required placeholder="Pvz., Spinta / kairė" enterKeyHint="done" autoComplete="off" /></label>
            </div>

            <section className="photo-capture-block">
              <div className="capture-section-title"><div><strong>Nuotraukos ir video</strong><span>{captureRecordType === "Brokas" ? "Brokui užtenka nuotraukos arba video." : "Nuotrauka nebūtina."} Iki {MAX_PHOTOS} foto ir {MAX_VIDEOS} video.</span></div><b>{photoDrafts.length}/{MAX_PHOTOS}</b></div>
              {annotatePromptPhotoId && (
                <div className="annotate-prompt" role="status">
                  <p>Nuotrauka pridėta. Pažymėti broko vietą?</p>
                  <div>
                    <button type="button" className="secondary-button" onClick={() => setAnnotatePromptPhotoId(null)}>Ne dabar</button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        const photo = photoDrafts.find((item) => item.id === annotatePromptPhotoId);
                        if (photo) editPhotoDraft(photo);
                        else setAnnotatePromptPhotoId(null);
                      }}
                    >
                      ✎ Žymėti
                    </button>
                  </div>
                </div>
              )}
              <div
                className={`photo-drop-zone ${photoDragActive ? "photo-drop-active" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setPhotoDragActive(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setPhotoDragActive(true); }}
                onDragLeave={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPhotoDragActive(false);
                }}
                onDrop={handlePhotoDrop}
              >
                <div className="photo-draft-grid">
                  {photoDrafts.map((photo, index) => (
                    <article key={photo.id} className="photo-draft-card">
                      <div role="button" tabIndex={0} style={{ backgroundImage: `url(${photo.url})` }} onClick={() => setCaptureViewerIndex(index)} onKeyDown={(event) => { if (event.key === "Enter") setCaptureViewerIndex(index); }}><span>{index + 1}</span><button type="button" className="photo-draft-edit" onClick={(event) => { event.stopPropagation(); editPhotoDraft(photo); }}>✎ Žymėti</button><button type="button" className="photo-draft-remove" onClick={(event) => { event.stopPropagation(); removePhotoDraft(photo.id); }} aria-label={`Pašalinti ${index + 1} nuotrauką`}>×</button></div>
                      <input value={photo.caption} onChange={(event) => updatePhotoCaption(photo.id, event.target.value)} placeholder="Kas matosi? (nebūtina)" />
                    </article>
                  ))}
                  {videoDrafts.map((video, index) => (
                    <article key={video.id} className="photo-draft-card video-draft-card">
                      <div role="button" tabIndex={0} onClick={() => setCaptureViewerIndex(photoDrafts.length + index)} onKeyDown={(event) => { if (event.key === "Enter") setCaptureViewerIndex(photoDrafts.length + index); }}><video src={video.url} muted playsInline preload="metadata" /><span>▶ {index + 1}</span><button type="button" className="photo-draft-remove" onClick={(event) => { event.stopPropagation(); removeVideoDraft(video.id); }} aria-label={`Pašalinti ${index + 1} video`}>×</button></div>
                      <input value={video.caption} onChange={(event) => updateVideoCaption(video.id, event.target.value)} placeholder="Kas rodoma? (nebūtina)" />
                    </article>
                  ))}
                  {photoDrafts.length < MAX_PHOTOS && <>
                      <MediaFileButton className="photo-add-tile photo-camera-tile" accept="image/*" capture="environment" onFiles={(files) => handlePhotos(files, true)}>
                        <span className="photo-action-symbol">◎</span><strong>Fotografuoti</strong><small>Atidaryti kamerą</small>
                      </MediaFileButton>
                      <MediaFileButton className="photo-add-tile photo-upload-tile" accept="image/*" multiple onFiles={handlePhotos}>
                        <span className="photo-action-symbol">⇧</span><strong>Įkelti</strong><small>Galerija</small>
                      </MediaFileButton>
                    </>}
                  {videoDrafts.length < MAX_VIDEOS && <>
                    <MediaFileButton className="photo-add-tile video-camera-tile" accept="video/*" capture="environment" onFiles={handleVideos}>
                      <span className="photo-action-symbol">●</span><strong>Filmuoti</strong><small>Kamera</small>
                    </MediaFileButton>
                    <MediaFileButton className="photo-add-tile video-upload-tile" accept="video/*" multiple onFiles={handleVideos}>
                      <span className="photo-action-symbol">▶</span><strong>Video</strong><small>Galerija</small>
                    </MediaFileButton>
                  </>}
                </div>
                <div className="photo-drop-hint"><span>⇩</span><div><strong>Arba nutempkite nuotraukas ir video čia</strong><small>Kompiuteryje galima įkelti kelis failus iš karto</small></div></div>
              </div>
            </section>

            <section className="issue-builder">
              {showCaptureNote || issueDrafts.some((item) => item.issue || item.requiredWork) ? (
                <>
                  <div className="capture-section-title"><div><strong>{recordCopy[captureRecordType].section}</strong><span>{recordCopy[captureRecordType].sectionHelp}</span></div></div>
                  <div className="issue-draft-list">
                    {issueDrafts.map((item, index) => (
                      <article key={item.id} className="issue-draft-card">
                        <div className="issue-number"><span>{index + 1}</span><strong>{recordCopy[captureRecordType].item}</strong>{issueDrafts.length > 1 && <button type="button" onClick={() => removeIssueDraft(item.id)} aria-label={`Pašalinti ${index + 1} pastabą`}>Pašalinti</button>}</div>
                        <label><span>{recordCopy[captureRecordType].issueLabel}</span><textarea rows={3} value={item.issue} onChange={(event) => updateIssueDraft(item.id, { issue: event.target.value })} placeholder={recordCopy[captureRecordType].issuePlaceholder} /></label>
                        <label><span>{recordCopy[captureRecordType].workLabel}</span><textarea rows={2} value={item.requiredWork} onChange={(event) => updateIssueDraft(item.id, { requiredWork: event.target.value })} placeholder={recordCopy[captureRecordType].workPlaceholder} /></label>
                      </article>
                    ))}
                  </div>
                  {issueDrafts.length < 20 && <button type="button" className="add-issue-button" onClick={() => setIssueDrafts((items) => [...items, blankIssue()])}>＋ Dar viena pastaba</button>}
                </>
              ) : (
                <button type="button" className="add-issue-button" onClick={() => setShowCaptureNote(true)}>＋ Pastaba (nebūtina)</button>
              )}
            </section>

            {showCaptureMore ? (
              <>
                {captureRecordType === "Papildoma apimtis" && <section className="additional-scope-fields">
                  <div className="capture-section-title"><div><strong>Papildomos apimties informacija</strong><span>Galite užpildyti vėliau.</span></div></div>
                  <div className="form-grid">
                    <label><span>Kas paprašė?</span><input name="requestedBy" placeholder="Pvz., užsakovas" /></label>
                    <label><span>Kaina, EUR</span><input name="price" inputMode="decimal" placeholder="Pvz., 250" /></label>
                    <label className="wide"><span>Pastabos</span><textarea name="notes" rows={2} placeholder="Suderinimai ar sąlygos" /></label>
                  </div>
                </section>}
                <section className="assignment-fields">
                  <div className="capture-section-title"><div><strong>Vykdymas</strong><span>Galite palikti tuščią ir papildyti biure.</span></div></div>
                  <div className="form-grid">
                    <label><span>Prioritetas</span><select name="priority" defaultValue="Vidutinis"><option>Kritinis</option><option>Aukštas</option><option>Vidutinis</option><option>Žemas</option></select></label>
                    <ResponsiblePicker
                      idPrefix="capture-responsible"
                      party={captureResponsible}
                      otherText={captureResponsibleOther}
                      onPartyChange={(party) => {
                        setCaptureResponsible(party);
                        if (party !== RESPONSIBLE_OTHER) setCaptureResponsibleOther("");
                      }}
                      onOtherTextChange={setCaptureResponsibleOther}
                    />
                    <label><span>Terminas</span><input name="due" type="date" /></label>
                  </div>
                </section>
              </>
            ) : (
              <button type="button" className="add-issue-button" onClick={() => setShowCaptureMore(true)}>＋ Prioritetas, atsakomybė, terminas</button>
            )}

            <div className="quick-note"><b>Greitam fiksavimui</b><span>Užtenka pozicijos, patalpos ir zonos. Brokui — nuotrauka arba video.</span></div>
            <div className="panel-actions"><button type="button" className="secondary-button" onClick={closeCapture} disabled={captureSaving}>Atšaukti</button><button className="primary-button" type="submit" disabled={captureSaving}>{captureSaving ? "Saugoma…" : recordCopy[captureRecordType].save} {captureSaving ? null : <span>→</span>}</button></div>
          </form>
          )}
        </div>
      )}


      {projectPickerOpen && isStaff && (
        <div className="modal-layer project-modal-layer project-picker-layer" role="dialog" aria-modal="true" aria-labelledby="project-picker-title">
          <button className="modal-scrim" onClick={() => setProjectPickerOpen(false)} aria-label="Uždaryti" />
          <section className="project-modal project-picker-modal">
            <div className="panel-title">
              <div><span>Darbo aplinka</span><h2 id="project-picker-title">Pasirinkti projektą</h2></div>
              <button type="button" onClick={() => setProjectPickerOpen(false)} aria-label="Uždaryti">×</button>
            </div>
            <p>Pasirinktas projektas bus naudojamas visiems naujiems įrašams šiame telefone ar kompiuteryje, kol jį pakeisite.</p>
            <label className="invite-toggle"><input type="checkbox" checked={showCompletedProjects} onChange={(event) => setShowCompletedProjects(event.target.checked)} /><span>Rodyti baigtus projektus</span></label>
            <label className="project-picker-search">
              <span>⌕</span>
              <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Ieškoti projekto…" autoFocus />
            </label>
            <div className="project-choice-list">
              {filteredProjects.map((project) => (
                <div key={project.id} className={`project-choice-row ${profile.role === "staff" ? "project-choice-row-staff" : ""} ${project.id === resolvedProjectId ? "project-choice-active" : ""}`}>
                  <button type="button" onClick={() => selectProject(project.id)}>
                    <span className="project-choice-dot" />
                    <span><strong>{project.name}</strong><small>{isProjectCompleted(project) ? "Baigtas" : project.address || "Informaciją papildysite vėliau"}</small></span>
                    <em>{project.id === resolvedProjectId ? "Pasirinktas" : "Pasirinkti"}</em>
                  </button>
                  {profile.role === "staff" ? (
                    <>
                      <button type="button" className="project-choice-edit" onClick={() => openEditProject(project)} aria-label={`Redaguoti ${project.name}`}>✎</button>
                      <button type="button" className="project-choice-delete" onClick={() => void deleteProjectById(project.id)} aria-label={`Ištrinti ${project.name}`} disabled={editProjectSaving}>🗑</button>
                    </>
                  ) : null}
                </div>
              ))}
              {!filteredProjects.length && <div className="project-choice-empty">{showCompletedProjects ? "Pagal paiešką projektų nerasta." : "Nėra vykdomų projektų. Įjunkite „Rodyti baigtus“ arba sukurkite naują."}</div>}
            </div>
            {profile.role === "staff" && <button type="button" className="project-create-button" onClick={() => { setProjectPickerOpen(false); setNewProjectOpen(true); }}>＋ Sukurti naują projektą</button>}
          </section>
        </div>
      )}

      {newProjectOpen && profile.role === "staff" && (
        <div className="modal-layer project-modal-layer" role="dialog" aria-modal="true" aria-labelledby="project-title">
          <button className="modal-scrim" onClick={() => setNewProjectOpen(false)} aria-label="Uždaryti" />
          <form className="project-modal" onSubmit={addProject}>
            <div className="panel-title"><div><span>Naujas projektas</span><h2 id="project-title">Sukurti projektą</h2></div><button type="button" onClick={() => setNewProjectOpen(false)} aria-label="Uždaryti">×</button></div>
            <p>Dabar pakanka projekto pavadinimo. Adresą, kontaktinį asmenį ir kitą informaciją galėsite papildyti vėliau projekto viduje.</p>
            <label><span>Projekto pavadinimas *</span><input name="name" required placeholder="Pvz., Vytenio g. 15" autoFocus /></label>
            <div className="panel-actions"><button type="button" className="secondary-button" onClick={() => setNewProjectOpen(false)}>Atšaukti</button><button type="submit" className="primary-button">Sukurti ir pasirinkti</button></div>
          </form>
        </div>
      )}

      {editProjectId && profile.role === "staff" && (
        <div className="modal-layer project-modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
          <button className="modal-scrim" onClick={() => !editProjectSaving && setEditProjectId(null)} aria-label="Uždaryti" />
          <form className="project-modal" onSubmit={saveEditedProject}>
            <div className="panel-title"><div><span>Objektas</span><h2 id="edit-project-title">Redaguoti projektą</h2></div><button type="button" onClick={() => setEditProjectId(null)} aria-label="Uždaryti" disabled={editProjectSaving}>×</button></div>
            <p>Pataisykite pavadinimą ar adresą. Baigtus objektus paslėpsime nuo aktyvaus sąrašo, bet galėsite juos rasti per „Rodyti baigtus“.</p>
            <label><span>Projekto pavadinimas *</span><input value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} required placeholder="Pvz., BURGA" autoFocus /></label>
            <label><span>Adresas</span><input value={editProjectAddress} onChange={(event) => setEditProjectAddress(event.target.value)} placeholder="Pvz., Kauno LEZ" /></label>
            <label><span>Būsena</span>
              <select value={editProjectStatus} onChange={(event) => setEditProjectStatus(event.target.value as ProjectStatus)}>
                {projectStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <div className="panel-actions project-edit-actions">
              <button type="button" className="danger-button" onClick={() => void deleteEditedProject()} disabled={editProjectSaving}>Ištrinti</button>
              <button type="button" className="secondary-button" onClick={() => setEditProjectId(null)} disabled={editProjectSaving}>Atšaukti</button>
              <button type="submit" className="primary-button" disabled={editProjectSaving || !editProjectName.trim()}>{editProjectSaving ? "Saugoma…" : "Išsaugoti"}</button>
            </div>
          </form>
        </div>
      )}

      {inviteOpen && profile.role === "staff" && (
        <div className="modal-layer project-modal-layer" role="dialog" aria-modal="true" aria-labelledby="invite-title">
          <button className="modal-scrim" onClick={() => setInviteOpen(false)} aria-label="Uždaryti" />
          <form className="project-modal invite-modal" onSubmit={sendInvite}>
            <div className="panel-title"><div><span>{activeProject.name}</span><h2 id="invite-title">Klientų nuoroda</h2></div><button type="button" onClick={() => setInviteOpen(false)} aria-label="Uždaryti">×</button></div>
            <p>Pirmą kartą klientas atidaro šią nuorodą ir susikuria paskyrą (savo el. paštas + slaptažodis). Kitą kartą jam užtenka atidaryti programėlę (vėliau <b>brokai.distyle.lt</b>) ir prisijungti tuo pačiu acc — nuorodos nebereikia, matys tik šį objektą.</p>
            <label className="invite-toggle"><input type="checkbox" checked={Boolean(activeProject.clientsSeeStaffRecords)} onChange={() => void toggleClientVisibility()} /><span>Klientas mato ir Distyle pažymėtus brokus</span></label>
            <div className="share-link-box">
              <strong>Bendroji nuoroda</strong>
              {shareLinkLoading ? <p className="share-link-loading">Ruošiama nuoroda…</p> : null}
              {shareLink ? (
                <>
                  <input
                    className="share-link-url"
                    readOnly
                    value={shareLink}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Klientų nuoroda"
                  />
                  {shareLink.includes("localhost") || shareLink.includes("127.0.0.1") || shareLink.includes("0.0.0.0") ? (
                    <p className="share-link-hint">Telefone atidarykite programėlę per Wi‑Fi adresą (pvz. http://192.168.x.x:3010) ir sugeneruokite nuorodą iš naujo.</p>
                  ) : null}
                  <div className="share-link-actions">
                    <button type="button" className="secondary-button" onClick={() => void copyShareLink()}>Kopijuoti / Dalintis</button>
                    <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(`Brokų registravimas (${activeProject.name}): ${shareLink}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </div>
                </>
              ) : null}
            </div>
            <div className="invite-personal-block">
              <strong>Asmeninis kvietimas (nebūtina)</strong>
              <span>Konkrečiam el. paštui — nuoroda veiks tik tam paštui.</span>
              <label><span>Kliento el. paštas</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="klientas@imone.lt" /></label>
              {inviteLink ? <p className="invite-link">Asmeninė nuoroda:<br />{inviteLink}</p> : null}
            </div>
            <div className="panel-actions"><button type="button" className="secondary-button" onClick={() => setInviteOpen(false)}>Uždaryti</button><button type="submit" className="primary-button" disabled={!inviteEmail.trim()}>Sukurti asmeninę nuorodą</button></div>
          </form>
        </div>
      )}

      {detail && (
        <div className={`detail-drawer ${detailId ? "drawer-open" : ""}`}>
          <div className="drawer-header"><div><span>{detail.code} <em className={recordTypeClass(detail.recordType)}>{detail.recordType}</em>{isStaff && originBadge(detail)}</span><small>{placeLabel(detail)}{isStaff && isClientOrigin(detail) && detail.createdByEmail ? ` · įkėlė ${detail.createdByEmail}` : isStaff ? " · Distyle" : ""}</small></div><button onClick={() => setDetailId(null)} aria-label="Uždaryti">×</button></div>
          <div
            className={`drawer-gallery ${detailPhotoDragActive ? "drawer-gallery-drag-active" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDetailPhotoDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDetailPhotoDragActive(true); }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDetailPhotoDragActive(false);
            }}
            onDrop={handleMorePhotoDrop}
          >
            {detailMedia.length ? (
              <div className="drawer-thumbs">
                {detailMedia.map((item, index) => (
                  <button type="button" key={item.id} className="drawer-thumb" onClick={() => setMediaViewerIndex(index)}>
                    {item.kind === "video" ? (
                      <>
                        <video src={item.url} muted playsInline preload="metadata" />
                        <span className="thumb-play">▶</span>
                      </>
                    ) : (
                      <span className="thumb-photo" style={{ backgroundImage: `url(${item.url})` }} />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="drawer-no-media">Nėra nuotraukų ar video — pridėkite žemiau</p>
            )}
            <div className="drawer-media-actions">
              <MediaFileButton className="drawer-media-action" accept="image/*" capture="environment" onFiles={uploadMorePhotos}><b>◎</b> Foto</MediaFileButton>
              <MediaFileButton className="drawer-media-action" accept="image/*" multiple onFiles={uploadMorePhotos}><b>⇧</b> Galerija</MediaFileButton>
              <MediaFileButton className="drawer-media-action" accept="video/*" capture="environment" onFiles={uploadMoreVideos}><b>●</b> Video</MediaFileButton>
              <MediaFileButton className="drawer-media-action" accept="video/*" multiple onFiles={uploadMoreVideos}><b>▶</b> Failas</MediaFileButton>
            </div>
            <div className="drawer-drop-note">Kompiuteryje nuotraukas ir video galite nutempti į šią sritį</div>
          </div>
          <div className="drawer-body">
            <span className={statusClass(detail.status)}><i />{detail.status}</span>
            <h2>{detail.title}</h2>
            <p className="detail-summary">{mediaLine(detailPhotos.length, detailVideos.length, detailItems.length) || "Be pastabų"}</p>
            <section className="detail-issues">
              {showDetailNotes ? (
                <>
                  <div className="detail-section-title"><strong>{recordCopy[detail.recordType].section}</strong><button type="button" onClick={addDetailItem}>＋ Pridėti</button></div>
                  {detailItems.map((item, index) => (
                    <article key={item.id}>
                      <div><span>{index + 1}</span><strong>{recordCopy[detail.recordType].item}</strong>{detailItems.length > 1 && <button type="button" onClick={() => removeDetailItem(item.id)}>Pašalinti</button>}</div>
                      <label><span>{recordCopy[detail.recordType].issueLabel.replace(" *", "")}</span><textarea rows={3} value={item.issue} onChange={(event) => updateDetailItem(item.id, { issue: event.target.value })} /></label>
                      <label><span>{recordCopy[detail.recordType].workLabel}</span><textarea rows={2} value={item.requiredWork} onChange={(event) => updateDetailItem(item.id, { requiredWork: event.target.value })} placeholder="Nurodykite reikalingus darbus" /></label>
                    </article>
                  ))}
                  <button type="button" className="save-issues-button" onClick={saveDetailItems}>Išsaugoti aprašymą</button>
                </>
              ) : (
                <button type="button" className="add-issue-button" onClick={() => { setShowDetailNote(true); if (!detailItems.length) addDetailItem(); }}>＋ Pastaba (nebūtina)</button>
              )}
            </section>
            <hr />
            {detail.recordType === "Papildoma apimtis" && detailMetaDraft && <div className="detail-commercial">
              <label><span>Kas paprašė?</span><input value={detailMetaDraft.requestedBy} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, requestedBy: event.target.value } : draft)} placeholder="Užsakovas arba kontaktinis asmuo" /></label>
              <label><span>Kaina, EUR</span><input inputMode="decimal" value={detailMetaDraft.price} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, price: event.target.value } : draft)} placeholder="0,00" /></label>
              <label><span>Pastabos</span><textarea rows={3} value={detailMetaDraft.notes} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, notes: event.target.value } : draft)} placeholder="Suderinimai, sąlygos ar kita informacija" /></label>
              <hr />
            </div>}
            {detailMetaDraft && <div className="detail-meta">
              <ResponsiblePicker
                idPrefix="detail-responsible"
                party={detailMetaDraft.responsible}
                otherText={detailMetaDraft.assignee}
                onPartyChange={(party) => setDetailMetaDraft((draft) => draft ? { ...draft, responsible: party, assignee: party === RESPONSIBLE_OTHER ? draft.assignee : "" } : draft)}
                onOtherTextChange={(value) => setDetailMetaDraft((draft) => draft ? { ...draft, assignee: value } : draft)}
              />
              <label><span>Terminas</span><input type="date" value={detailMetaDraft.due === "Nenustatyta" ? "" : detailMetaDraft.due} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, due: event.target.value || "Nenustatyta" } : draft)} /></label>
              <label><span>Būsena</span><select value={detailMetaDraft.status} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, status: event.target.value as Status } : draft)}>{statusList.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>}
            {detailMetaDraft && <label><span>Sprendimo būdas / atlikti darbai</span><textarea rows={4} value={detailMetaDraft.resolution} onChange={(event) => setDetailMetaDraft((draft) => draft ? { ...draft, resolution: event.target.value } : draft)} placeholder="Aprašykite, kaip įrašas bus arba buvo įvykdytas…" /></label>}
          </div>
          <div className="drawer-footer">
            {isRecordArchived(detail) ? (
              <button type="button" className="primary-button" onClick={() => void restoreDetail()}>Grąžinti į sąrašą</button>
            ) : (
              <>
                <button type="button" className="danger-button" onClick={() => void archiveDetail("delete")}>Ištrinti</button>
                {detailMetaDirty && (
                  <button type="button" className="secondary-button drawer-save-button" onClick={() => void saveDetailMeta()} disabled={detailMetaSaving}>
                    {detailMetaSaving ? "Saugoma…" : "Išsaugoti"}
                  </button>
                )}
                <button type="button" className="primary-button complete-action-button" onClick={() => void archiveDetail("complete")} disabled={completeSaving}>✓ Baigti</button>
              </>
            )}
          </div>
        </div>
      )}
      {detailId && <button className="drawer-scrim" onClick={() => setDetailId(null)} aria-label="Uždaryti detalę" />}

      {reportMode && isStaff && (
        <div className="report-modal-layer" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <button className="modal-scrim" onClick={() => setReportMode(false)} aria-label="Uždaryti ataskaitą" />
          <section className="report-builder">
            <header className="report-builder-head"><div><span>Ataskaita</span><h2 id="report-title">{activeProject.name}</h2><p>Pasirinkite įrašus arba eksportuokite visus matomus. PDF ir CSV.</p></div><button onClick={() => setReportMode(false)} aria-label="Uždaryti">×</button></header>
            <div className="report-builder-layout">
              <aside className="report-settings">
                <div className="report-setting-section"><strong>Taikomi filtrai</strong><div className="report-filter-tags">{reportFilterTags.map((tag) => <span key={tag}>{tag}</span>)}</div><button onClick={() => { setReportMode(false); setFiltersOpen(true); }}>Keisti filtrus</button></div>
                <div className="report-setting-section"><strong>Įrašų atranka</strong><p>{reportRows.length ? `${reportRows.length} pažymėta` : `Visi matomi (${exportRows.length})`} · iš {visibleDefects.length}</p><div className="report-selection-buttons"><button type="button" onClick={() => setVisibleSelection(true)}>Pažymėti visus</button><button type="button" onClick={() => setVisibleSelection(false)}>Atžymėti</button></div>
                  <div className="report-record-picker">
                    {visibleDefects.map((defect) => (
                      <label key={defect.id}>
                        <input type="checkbox" checked={defect.selected} onChange={() => toggleSelected(defect.id)} aria-label={`Įtraukti ${defect.code}`} />
                        <span>
                          <b>{defect.code}</b> {defect.title}
                          <small>{defect.recordType} · {placeLabel(defect)}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="report-setting-section"><strong>Ką rodyti ataskaitoje?</strong>
                  {([
                    ["photos", "Nuotraukas"],
                    ["descriptions", "Aprašymus ir darbus"],
                    ["responsibility", "Atsakingus ir terminus"],
                    ["commercial", "Kainą ir pastabas"],
                  ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={reportOptions[key]} onChange={(event) => setReportOptions((value) => ({ ...value, [key]: event.target.checked }))} /><span>{label}</span></label>)}
                </div>
              </aside>
              <div className="report-preview">
                <div className="report-preview-paper">
                  <header><div><small>DISTYLE · OBJEKTO DARBŲ ATASKAITA</small><h3>{activeProject.name}</h3><p>{activeProject.address || "Adresas nenurodytas"} · {new Intl.DateTimeFormat("lt-LT").format(new Date())}</p></div><b>{exportRows.length} poz.</b></header>
                  {!exportRows.length && <div className="report-empty">Nėra matomų įrašų pagal filtrus.</div>}
                  {exportRows.map((item) => {
                    const photos = defectPhotosFor(item);
                    const issues = defectItemsFor(item);
                    return <article key={item.id}>
                      <div className="report-preview-title"><div><small>{item.code} · {item.recordType} · {placeLabel(item)}</small><h4>{item.title}</h4></div><span className={statusClass(item.status)}><i />{item.status}</span></div>
                      {reportOptions.photos && photos.length > 0 && <div className="report-preview-photos">{photos.slice(0, 4).map((photo) => <img key={photo.id} src={photo.url} alt="" />)}{photos.length > 4 && <span>+{photos.length - 4}</span>}</div>}
                      {reportOptions.descriptions && <div className="report-preview-issues">{issues.map((issue, index) => <p key={issue.id}><b>{index + 1}.</b> {issue.issue}{issue.requiredWork && <small>Ką atlikti: {issue.requiredWork}</small>}</p>)}</div>}
                      {reportOptions.commercial && item.recordType === "Papildoma apimtis" && <div className="report-preview-commercial"><span>Kas paprašė: <b>{item.requestedBy || "—"}</b></span><span>Kaina: <b>{formatPrice(item.price)}</b></span></div>}
                      {reportOptions.responsibility && <footer><span>{responsibleDisplay(item.responsible, item.assignee)}</span><span>{item.due}</span></footer>}
                    </article>;
                  })}
                </div>
              </div>
            </div>
            <footer className="report-builder-actions">
              <button type="button" className="secondary-button report-close-button" onClick={() => setReportMode(false)}>Uždaryti</button>
              <button type="button" className="secondary-button report-export-button" onClick={downloadCsv}>CSV</button>
              <button type="button" className="primary-button report-export-button" onClick={printReport}>PDF</button>
            </footer>
          </section>
        </div>
      )}

      {photoEditorTarget && <PhotoEditor sourceUrl={photoEditorTarget.url} fileName={photoEditorTarget.fileName} saving={photoEditorSaving} onClose={closePhotoEditor} onSave={saveEditedPhoto} />}

      {mediaViewerIndex != null && detail && detailMedia[mediaViewerIndex] && (
        <MediaViewer
          items={detailMedia}
          index={mediaViewerIndex}
          onClose={() => setMediaViewerIndex(null)}
          onIndexChange={setMediaViewerIndex}
          onAnnotate={
            detailMedia[mediaViewerIndex].kind === "photo" && !detailMedia[mediaViewerIndex].id.startsWith("local-") && !detailMedia[mediaViewerIndex].id.startsWith("legacy-")
              ? () => {
                  setMediaViewerIndex(null);
                  const photo = detailPhotos.find((item) => item.id === detailMedia[mediaViewerIndex].id);
                  if (photo) void editSavedPhoto(photo);
                }
              : undefined
          }
        />
      )}

      {captureViewerIndex != null && captureMedia[captureViewerIndex] && (
        <MediaViewer
          items={captureMedia}
          index={captureViewerIndex}
          onClose={() => setCaptureViewerIndex(null)}
          onIndexChange={setCaptureViewerIndex}
          onAnnotate={
            captureMedia[captureViewerIndex].kind === "photo"
              ? () => {
                  setCaptureViewerIndex(null);
                  const photo = photoDrafts.find((item) => item.id === captureMedia[captureViewerIndex].id);
                  if (photo) editPhotoDraft(photo);
                }
              : undefined
          }
        />
      )}

      {completeOpen && detail && (
        <div className="modal-layer complete-modal-layer" role="dialog" aria-modal="true" aria-labelledby="complete-title">
          <button className="modal-scrim" onClick={() => !completeSaving && setCompleteOpen(false)} aria-label="Uždaryti" />
          <section className="capture-panel complete-panel">
            <div className="panel-handle" />
            <div className="panel-title"><div><span>{detail.code}</span><h2 id="complete-title">Baigti įrašą</h2></div><button type="button" onClick={() => setCompleteOpen(false)} disabled={completeSaving} aria-label="Uždaryti">×</button></div>
            <div className="complete-status-preview"><span className={statusClass(COMPLETED_STATUS)}><i />{COMPLETED_STATUS}</span><p>Nauja būsena po patvirtinimo</p></div>
            <p className="complete-copy">Įrašas bus pažymėtas kaip <strong>Baigtas</strong> ir perkeltas į archyvą.</p>
            <div className="complete-photo-block">
              <strong>Po remonto nuotrauka (nebūtina)</strong>
              <span>Parodykite, kaip atrodo po sutvarkymo.</span>
              {completePhotoPreview ? (
                <div className="complete-photo-preview">
                  <img src={completePhotoPreview} alt="Po remonto peržiūra" />
                  <button type="button" className="secondary-button" onClick={clearCompletePhoto} disabled={completeSaving}>Pašalinti</button>
                </div>
              ) : (
                <div className="complete-photo-actions">
                  <MediaFileButton className="photo-add-tile photo-camera-tile" accept="image/*" capture="environment" onFiles={handleCompletePhoto} disabled={completeSaving}>
                    <span className="photo-action-symbol">◎</span><strong>Fotografuoti</strong>
                  </MediaFileButton>
                  <MediaFileButton className="photo-add-tile photo-upload-tile" accept="image/*" onFiles={handleCompletePhoto} disabled={completeSaving}>
                    <span className="photo-action-symbol">⇧</span><strong>Įkelti</strong>
                  </MediaFileButton>
                </div>
              )}
            </div>
            <div className="panel-actions">
              <button type="button" className="secondary-button" onClick={() => setCompleteOpen(false)} disabled={completeSaving}>Atšaukti</button>
              <button type="button" className="primary-button complete-action-button" onClick={() => void confirmComplete()} disabled={completeSaving}>{completeSaving ? "Baigiama…" : "✓ Patvirtinti · Baigtas"}</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
