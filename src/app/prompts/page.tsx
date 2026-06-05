import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Terminal, Database, Layout, Shield } from "lucide-react";

const promptModels = [
  {
    id: 1,
    title: "Database Schema Architect",
    category: "Prisma/PostgreSQL",
    icon: Database,
    prompt: "Act as a Senior Database Engineer. Design a highly efficient Prisma schema for a [TOPIC] application. Ensure many-to-many relationships are handled correctly, include indexes for frequent queries, and implement soft deletes. Output the prisma.schema file content."
  },
  {
    id: 2,
    title: "Server Action Logic Generator",
    category: "Next.js",
    icon: Code,
    prompt: "Write a production-ready Next.js Server Action for handling [FEATURE]. Include input validation using Zod, proper error handling with custom error classes, and use Prisma transactions if multiple database operations are involved. Ensure revalidation of relevant cache tags."
  },
  {
    id: 3,
    title: "Shadcn Component Customizer",
    category: "UI/UX",
    icon: Layout,
    prompt: "Generate a complex UI component using Shadcn primitives for a [COMPONENT_NAME]. It should be fully responsive, accessible (ARIA), and use Tailwind CSS for a 'modern technology' aesthetic matching hex codes #3A6ED0 (primary) and #7DD2E1 (accent)."
  },
  {
    id: 4,
    title: "Responsive Layout Auditor",
    category: "Tailwind CSS",
    icon: Layout,
    prompt: "Review this React component code and optimize it for mobile-first responsiveness. Replace fixed widths with fluid layouts, implement adaptive typography using Tailwind's clamp or responsive utilities, and ensure interactive elements meet minimum touch target sizes."
  },
  {
    id: 5,
    title: "Security Middleware Specialist",
    category: "Next.js",
    icon: Shield,
    prompt: "Create a Next.js middleware function that enforces authentication for routes matching [PATH_PATTERN]. It should check for a valid session token, handle redirects gracefully, and implement basic rate limiting using an edge-compatible approach."
  },
  {
    id: 6,
    title: "Zod Schema & Type Synchronizer",
    category: "TypeScript",
    icon: Code,
    prompt: "Define a comprehensive Zod validation schema for a [FORM_NAME] form. Infer the TypeScript type from the schema and provide a utility function that safely parses input and returns a structured error object suitable for React Hook Form."
  },
  {
    id: 7,
    title: "GitHub Actions CI/CD Expert",
    category: "DevOps",
    icon: Terminal,
    prompt: "Write a GitHub Actions YAML workflow that triggers on pull requests to 'main'. It must run ESLint, execute Vitest unit tests, perform a Prisma generate step, and trigger a preview deployment to Vercel with environment variable checks."
  },
  {
    id: 8,
    title: "App Router SEO Strategist",
    category: "Next.js",
    icon: Layout,
    prompt: "Generate the dynamic generateMetadata function for a Next.js 15 route. Include OpenGraph tags, Twitter cards, and JSON-LD structured data for a [PAGE_TYPE] page to maximize search visibility and social sharing impact."
  },
  {
    id: 9,
    title: "Performance Optimization Auditor",
    category: "Optimization",
    icon: Terminal,
    prompt: "Analyze this Next.js page for potential performance bottlenecks. Identify components that can be converted to Server Components, suggest dynamic imports for heavy client libraries, and optimize image loading using next/image with proper sizes attributes."
  },
  {
    id: 10,
    title: "Prisma Migration Strategy",
    category: "Database",
    icon: Database,
    prompt: "Draft a data migration script for transitioning from [OLD_SCHEMA] to [NEW_SCHEMA] in a PostgreSQL environment. Ensure data integrity, handle potential null values, and provide a rollback strategy using Prisma's $executeRaw."
  },
  {
    id: 11,
    title: "Error Boundary Implementation",
    category: "React",
    icon: Shield,
    prompt: "Design a robust error.tsx file for a Next.js route segment. It should capture unexpected errors, log them to a service like Sentry, and provide a user-friendly recovery UI with a 'try again' button that clears the route cache."
  },
  {
    id: 12,
    title: "Tailwind Dark Mode Transformer",
    category: "UI",
    icon: Layout,
    prompt: "Take this existing component and add comprehensive 'dark:' variants. Ensure contrast ratios meet WCAG AA standards using the palette: background #0a0e17 and primary #3A6ED0. Use CSS variables for theme consistency."
  },
  {
    id: 13,
    title: "API Route Rate Limiter",
    category: "Security",
    icon: Shield,
    prompt: "Implement a sliding window rate limiting utility for Next.js API routes using Redis (Upstash) to prevent abuse of the [ENDPOINT_NAME]. Include headers for X-RateLimit-Limit and X-RateLimit-Remaining."
  },
  {
    id: 14,
    title: "Next.js Parallel Routes Architect",
    category: "Next.js",
    icon: Layout,
    prompt: "Structure a complex dashboard layout using Next.js Parallel Routes (@slots). Explain how to handle independent loading states for a 'feed' slot and a 'sidebar' slot while maintaining a unified URL structure."
  },
  {
    id: 15,
    title: "ESLint Strict Rule Generator",
    category: "Code Quality",
    icon: Terminal,
    prompt: "Generate a .eslintrc.json configuration optimized for a Next.js/TypeScript project. Include rules for enforcing clean imports, prohibiting 'any' types, requiring JSDoc for complex functions, and optimizing Tailwind class ordering."
  }
];

export default function PromptsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12 md:py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <header className="mb-12 max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight mb-4">Advanced Prompt Models</h1>
            <p className="text-xl text-muted-foreground">
              A comprehensive guide of 15 specialized AI prompts tailored for the InstantPage stack: 
              Next.js, TypeScript, Prisma, and Tailwind.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {promptModels.map((item) => (
              <Card key={item.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                      {item.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-md text-xs font-mono text-muted-foreground leading-relaxed h-32 overflow-y-auto border group-hover:border-primary/20 transition-colors">
                    <span className="text-primary font-bold">PROMPT: </span>
                    {item.prompt}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      
      <footer className="border-t py-8 bg-background">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            InstantPage Guide - Empowering developers with AI-assisted workflows.
          </p>
        </div>
      </footer>
    </div>
  );
}