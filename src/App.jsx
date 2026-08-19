import Hero from "./components/Hero"
import CoursesSection from "./components/CoursesSection"
import Footer from "./components/Footer"

/**
 * Local preview of the Skillpath page. All three sections are Framer code
 * components, so what renders here is exactly what renders on the published
 * site. Nothing is styled from index.css.
 */
export default function App() {
  return (
    <>
      <Hero />
      <div id="courses">
        <CoursesSection />
      </div>
      <Footer />
    </>
  )
}
