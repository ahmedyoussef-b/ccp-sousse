import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Zap } from "lucide-react";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight text-primary">InstantPage</span>
          </Link>
        </div>
        <div className="hidden items-center gap-6 md:flex">
          <Link href="/prompts" className="text-sm font-medium hover:text-primary transition-colors">
            Prompt Models
          </Link>
          <Link href="/#features" className="text-sm font-medium hover:text-primary transition-colors">
            Features
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/prompts">
              <FileText className="mr-2 h-4 w-4" />
              Prompts Guide
            </Link>
          </Button>
          <Button size="sm" className="hidden sm:flex">
            Get Started
          </Button>
        </div>
      </div>
    </nav>
  );
}