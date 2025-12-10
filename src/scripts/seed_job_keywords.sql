-- Script pour insérer des mots-clés initiaux pour les métiers les plus courants
-- Ces mots-clés permettront de réduire les appels à l'API LLM

-- Exemples de correspondances métiers/mots-clés
INSERT INTO public.job_keywords (job_name, keywords) VALUES
  ('Développeur Front-End', ARRAY['développeur', 'front-end', 'frontend', 'javascript', 'react', 'vue', 'angular', 'html', 'css', 'web', 'interface', 'programmation', 'informatique']),
  ('Développeur Back-End', ARRAY['développeur', 'back-end', 'backend', 'server', 'api', 'base de données', 'sql', 'node', 'python', 'java', 'programmation', 'informatique']),
  ('Développeur Full-Stack', ARRAY['développeur', 'fullstack', 'full-stack', 'javascript', 'react', 'node', 'web', 'programmation', 'informatique', 'front-end', 'back-end']),
  ('Data Analyst', ARRAY['data', 'analyst', 'analyse', 'statistique', 'business intelligence', 'bi', 'analytics', 'tableau', 'power bi', 'excel', 'sql', 'données']),
  ('Data Scientist', ARRAY['data', 'scientist', 'machine learning', 'ai', 'intelligence artificielle', 'python', 'r', 'statistique', 'analyse', 'données', 'modélisation']),
  ('UX Designer', ARRAY['ux', 'designer', 'design', 'interface', 'utilisateur', 'ergonomie', 'expérience utilisateur', 'wireframe', 'prototype', 'figma', 'sketch']),
  ('UI Designer', ARRAY['ui', 'designer', 'design', 'interface', 'graphisme', 'visuel', 'création graphique', 'figma', 'sketch', 'adobe', 'illustration']),
  ('UI/UX Designer', ARRAY['ux', 'ui', 'designer', 'design', 'interface', 'utilisateur', 'ergonomie', 'expérience utilisateur', 'graphisme', 'figma', 'sketch']),
  ('Développeur Web', ARRAY['développeur', 'web', 'javascript', 'html', 'css', 'php', 'python', 'ruby', 'programmation', 'informatique', 'site web']),
  ('Développeur Mobile', ARRAY['développeur', 'mobile', 'android', 'ios', 'swift', 'kotlin', 'react native', 'flutter', 'application mobile', 'programmation'])
ON CONFLICT (job_name) DO UPDATE
SET keywords = EXCLUDED.keywords,
    updated_at = NOW();
