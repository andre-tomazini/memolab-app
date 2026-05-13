const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const changes = [
        [/blue-600/g, 'primary'],
        [/blue-700/g, 'primary/90'],
        [/blue-50/g, 'primary/10'],
        [/blue-500/g, 'primary'],
        [/bg-neutral-50/g, 'bg-background'],
        [/bg-neutral-100/g, 'bg-muted'],
        [/border-neutral-100/g, 'border-border/50'],
        [/border-neutral-200/g, 'border-border'],
        [/text-neutral-300/g, 'text-muted-foreground/50'],
        [/text-neutral-400/g, 'text-muted-foreground/80'],
        [/text-neutral-500/g, 'text-muted-foreground'],
        [/text-neutral-600/g, 'text-muted'], // Actually, neutral-600 should probably be text-foreground/70
        [/text-neutral-800/g, 'text-foreground/90'],
        [/text-neutral-900/g, 'text-foreground'],
        [/bg-neutral-200/g, 'bg-border'],
        [/bg-neutral-800/g, 'bg-foreground/90'],
        [/bg-neutral-900/g, 'bg-foreground']
      ];

      // Fix neutral-600 to text-foreground/70
      changes[11] = [/text-neutral-600/g, 'text-foreground/70'];

      let newContent = content;
      for (const [regex, replacement] of changes) {
        newContent = newContent.replace(regex, replacement);
      }
      
      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

replaceInDir('./src');
