-- Migration: 001_create_site_content.sql
-- Creates a simple key/value content store and inserts the app's initial content JSON.
-- Run this in Supabase SQL editor or via psql connected to your Supabase database.

BEGIN;

-- 1) Create table
CREATE TABLE IF NOT EXISTS public.site_content (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Insert initial content (replace or extend as needed)
INSERT INTO public.site_content (key, value)
VALUES (
  'site_content',
  $$
{
  "projects.section.title": "Explore Our Construction Excellence Projects",
  "contact.section.title": "Let's Build Something Great Together Today",

  "services.hero.title": "What We Do",
  "services.hero.desc": "Civil, Infrastructure, and Environmental Engineering Consulting.",

  "about.section.title": "Civil – Infrastructure – Environment",
  "about.section.desc": "NB Engineering Consulting specializes in transport, railway, and water infrastructure. <span class=\"hide-mobile\">The company supports international and local clients through all project stages, from feasibility and hydraulic modelling to detailed design, tender documentation, and technical reviews, with a strong focus on constructability and compliance with international standards.</span>",

  "homepage.hero.title": "Building Your Dreams",
  "homepage.hero.desc": "Expert construction services with over 20 years of experience in delivering safe, sustainable infrastructure projects.",

  "homepage.about.title": "Your Trusted Partner in Infrastructure & Engineering Excellence",
  "homepage.about.desc": "NB Engineering Consulting specializes in transport, railway, and water infrastructure. <span class=\"hide-mobile\">The company supports international and local clients through all project stages, from feasibility and hydraulic modeling to detailed design, tender documentation, and technical reviews, with a strong focus on constructability and compliance with international standards.</span>",

  "contact.features": [
    "24/7 Support",
    "Free Consultation",
    "Certified Experts"
  ],

  "brochure1.title": "Company Brochure",
  "brochure1.description": "Explore our detailed portfolio and company vision. Read about our engineering excellence and construction projects anywhere.",
  "brochure1.cta_label": "Download now...",
  "brochure1.button_text": "Get Our Brochure",
  "brochure1.pdf_path": "assets/Fletepalosje consulting.pdf",
  "brochure1.image_path": "assets/misc/brochure.jpeg",

  "brochure2.title": "Personal Profile",
  "brochure2.description": "Learn more about the founder's background, expertise, and professional credentials. Download the personal profile to see detailed experience and references.",
  "brochure2.cta_label": "Download now...",
  "brochure2.button_text": "Get Our Brochure",
  "brochure2.pdf_path": "assets/fletepalosja nbraho.pdf",
  "brochure2.image_path": "assets/images/different categories/sitting.png",

  "services.cards": [ 
    {
      "icon": "assets/images/icons/roads.png",
      "iconAlt": "Roads",
      "title": "Roads & Transport Infrastructure",
      "list": [
        "Geometric design (horizontal and vertical alignment)",
        "Pavement design",
        "Drainage and cross-drainage systems",
        "Retaining walls and slope protection",
        "Tender drawings and Bills of Quantities"
      ],
      "link": "projects.html#roads-civil-infrastructure"
    },
    {
      "icon": "assets/images/icons/railway.png",
      "iconAlt": "Railway",
      "title": "Railway Engineering",
      "list": [
        "Railway alignment design and optimization",
        "Urban and interurban railway sections",
        "Stations and platform areas",
        "Drainage systems and culverts",
        "Digital Terrain Model (DTM) development",
        "Tender and implementation design documentation"
      ],
      "link": "projects.html#railway-projects"
    },
    {
      "icon": "assets/images/icons/water_supply.png",
      "iconAlt": "Water",
      "title": "Water Supply & Hydraulic Systems",
      "list": [
        "Hydraulic modelling (WaterGEMS)",
        "Non-Revenue Water (NRW) analysis and strategies",
        "Transmission and distribution pipelines",
        "Pumping stations, reservoirs, break pressure tanks",
        "Fire protection systems",
        "Technical reports and tender documentation"
      ],
      "link": "projects.html#water-supply-hydraulics"
    },
    {
      "icon": "assets/images/icons/building_site.png",
      "iconAlt": "Buildings",
      "title": "Buildings & Site Infrastructure",
      "list": [
        "Structural design of buildings",
        "Internal roads and parking areas",
        "Water supply, sewerage and stormwater networks",
        "Integrated civil–structural coordination",
        "Construction drawings and technical specifications"
      ],
      "link": "projects.html#buildings-special-projects"
    }
  ]
}
  $$::jsonb
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

-- 3) Row Level Security and Policies
ALTER TABLE IF EXISTS public.site_content ENABLE ROW LEVEL SECURITY;

-- Allow public reads
DROP POLICY IF EXISTS "public_select" ON public.site_content;
CREATE POLICY "public_select" ON public.site_content
  FOR SELECT
  USING ( true );

-- Allow writes only for authenticated users (admin accounts)
DROP POLICY IF EXISTS "authenticated_writes" ON public.site_content;
CREATE POLICY "authenticated_writes" ON public.site_content
  FOR ALL
  USING ( auth.role() = 'authenticated' )
  WITH CHECK ( auth.role() = 'authenticated' );

COMMIT;

-- NOTE: Storage buckets are managed in Supabase Storage UI. Recommended bucket names: "site-assets" or "brochures".
-- Create a public bucket in the Supabase dashboard and set public read (or use signed URLs).
-- If you want uploads via the client, ensure the admin user signs in and has permissions to write to that bucket.
