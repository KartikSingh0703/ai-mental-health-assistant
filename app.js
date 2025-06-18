require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // Serving static files from 'public' directory
app.set("view engine", "ejs");
app.use(
  session({
    secret: "secureKey",
    resave: false,
    saveUninitialized: true,
  })
);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Database connection error:", err));

// Schema and Models
const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  surveySubmitted: { type: Boolean, default: false }, // Tracks survey submission
});
const User = mongoose.model("User", UserSchema);

const SurveySchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, required: true },
  city: { type: String, required: true },
  activity: { type: String, required: true },
  medicalConditions: { type: [String], default: [] },
  emotionalHealth: { type: [String], default: [] },
  hobbies: { type: String },
  musicGenre: { type: [String], default: [] },
  height: { type: Number, required: true },
  weight: { type: Number, required: true },
  bmi: { type: String }, // Optional field to store BMI if calculated
});
const Survey = mongoose.model("Survey", SurveySchema);
const JournalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  entry: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Journal = mongoose.model("Journal", JournalSchema);



// Routes
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (user) {
    req.session.user = user;
    // Redirect to survey if not completed, otherwise to virtual assistant
    if (!user.surveySubmitted) {
      res.redirect("/survey");
    } else {
      res.redirect("/virtual-assistant");
    }
  } else {
    res.render("login", { error: "Invalid credentials!" });
  }
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.render("register", { error: "Email already registered!" });
  } else {
    const newUser = new User({ username, email, password });
    await newUser.save();
    res.redirect("/login");
  }
});

app.get("/survey", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  
  // If survey already submitted, redirect to virtual assistant
  const user = await User.findById(req.session.user._id);
  if (user.surveySubmitted) {
    return res.redirect("/virtual-assistant");
  }

  res.sendFile(path.join(__dirname, "public", "survey.html"));
});

// Survey submission route
app.post("/submit-survey", async (req, res) => {
  try {
    const {
      name,
      age,
      gender,
      city,
      activity,
      medicalConditions,
      emotionalHealth,
      hobbies,
      musicGenre,
      height,
      weight,
    } = req.body;

    // Calculate BMI
    const heightInMeters = height / 100;
    const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(2);

    // Create a new survey document
    const surveyData = new Survey({
      name,
      age,
      gender,
      city,
      activity,
      medicalConditions: Array.isArray(medicalConditions) ? medicalConditions : [medicalConditions],
      emotionalHealth: Array.isArray(emotionalHealth) ? emotionalHealth : [emotionalHealth],
      hobbies,
      musicGenre: Array.isArray(musicGenre) ? musicGenre : [musicGenre],
      height,
      weight,
      bmi,
    });

    // Save the survey to the database
    await surveyData.save();

    // Update user to mark survey as completed
    await User.findByIdAndUpdate(req.session.user._id, { surveySubmitted: true });

    console.log("Survey data saved:", surveyData);

    // Redirect to the virtual assistant page after successful submission
    res.redirect("/virtual-assistant");
  } catch (error) {
    console.error("Error saving survey data:", error);
    res.status(500).send("An error occurred while saving your survey details.");
  }
});

// Serve the virtual assistant page
app.get("/virtual-assistant", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "virtual-assistant.html"));
});

app.post("/save-journal", async (req, res) => {

  if (!req.session.user) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const { journalEntry } = req.body;

  if (!journalEntry || journalEntry.trim() === "") {
    return res.status(400).json({ message: "Journal entry cannot be empty" });
  }

  try {
    // Save the new entry
    const newEntry = new Journal({
      userId: req.session.user._id,
      entry: journalEntry,
    });

    await newEntry.save();

    // Fetch all entries for the user and sort by createdAt (descending)
    const userEntries = await Journal.find({ userId: req.session.user._id })
      .sort({ createdAt: -1 });

    // If more than 10 entries exist, delete the oldest ones
    if (userEntries.length > 10) {
      const entriesToDelete = userEntries.slice(10); // Entries beyond the 10th
      const idsToDelete = entriesToDelete.map((entry) => entry._id);

      await Journal.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.status(200).json({ message: "Journal entry saved successfully" });
  } catch (error) {
    console.error("Error saving journal entry:", error);
    res.status(500).json({ message: "Internal server error" });
    mongoose.connection.on("connected", () => {
      console.log("Mongoose connected to MongoDB");
    });
  }
});




// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
