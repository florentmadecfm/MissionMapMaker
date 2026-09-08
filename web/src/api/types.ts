export interface Actor {
  id: string
  name: string
  color: string
  description: string
}

export interface Phase {
  id: string
  name: string
  order: number
}

export interface UserStory {
  id: string
  title: string
  priority: 'must' | 'should' | 'could' | 'wont'
  release: string
  status: 'todo' | 'in_progress' | 'done'
}

export interface Activity {
  id: string
  name: string
  actorId: string
  phaseId: string
  order: number
  description: string
  sourceText?: string
  userStories: UserStory[]
  traceLinks: string[]
}

export interface Interaction {
  id: string
  fromActivityId: string
  toActivityId: string
  information: string
  description?: string
}

export type SpecificationType =
  | 'StakeholderNeed'
  | 'SystemRequirement'
  | 'SubsystemRequirement'
  | 'VerificationCriterion'

export interface Specification {
  id: string
  code: string
  type: SpecificationType
  text: string
  rationale?: string
  parentId?: string
  status: 'draft' | 'approved' | 'deprecated'
  priority: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  actors: Actor[]
  phases: Phase[]
  activities: Activity[]
  interactions: Interaction[]
  specifications: Specification[]
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
}
