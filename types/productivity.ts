export type Milestone = {
    title: string;
    target_date: string;
    completed: boolean;
};

export type Project = {
    id: string;
    name: string;
    description: string;
    overview?: string;
    status: string;
    progress: number;
    due_date: string | null;
    deadline?: string;
    milestones?: Milestone[];
    created_at: string;
    color?: string;
    emoji?: string;
    display_order?: number;
};

export type Section = {
    id: string;
    project_id: string;
    name: string;
    order: number;
    created_at: string;
};

export type Task = {
    id: string;
    name: string;
    description: string;
    status: 'To Do' | 'In Progress' | 'Done';
    priority: string;
    due_date: string | null;
    start_date?: string | null;
    completed_at?: string | null;
    project_id: string;
    section_id?: string | null;
    parent_id?: string | null;
    dependencies?: string[]; // Array of Task IDs
    is_brain_dump_item?: boolean;
    created_at: string;
};

export type BrainDumpItem = {
    id: string;
    content: string;
    status: 'Pending Review' | 'Applied' | 'Discarded';
    created_at: string;
};
